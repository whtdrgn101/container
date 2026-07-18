import { describe, expect, it } from 'vitest';
import type { CardEffect, Resource, StoneAgeState } from '../core';
import { acquireCard } from '../actions';
import { makeState, withPlacements, expectError } from './helpers';

const testCard = (effect: CardEffect) => ({ id: 'tc', effect, scoring: { kind: 'green', symbol: 'art' } as const });

/** An action-phase game where p1 has a person on card `slot`, whose card has the given effect. */
function scenario(slot: number, effect: CardEffect, p1res: Partial<Record<Resource, number>>): StoneAgeState {
  const place = `card${slot + 1}` as const;
  const base = withPlacements({ [place]: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
  return {
    ...base,
    cardDisplay: base.cardDisplay.map((c, i) => (i === slot ? testCard(effect) : c)),
    players: base.players.map((p, i) => (i === 0 ? { ...p, resources: { wood: 0, brick: 0, stone: 0, gold: 0, ...p1res } } : p)),
  };
}

describe('acquireCard', () => {
  it('pays the slot cost, applies the immediate effect, keeps the card, and empties the slot', () => {
    // Slot 0 costs 1 resource; pay 1 wood for a card granting 2 brick.
    const next = acquireCard(scenario(0, { kind: 'resource', resource: 'brick', amount: 2 }, { wood: 1 }), 'p1', 0, { wood: 1 });
    expect(next.players[0]!.resources).toMatchObject({ wood: 0, brick: 2 });
    expect(next.players[0]!.civCards).toEqual(['tc']); // kept for final scoring
    expect(next.cardDisplay[0]).toBeNull(); // slot emptied
    expect(next.placements.card1).toEqual({}); // person returned
    expect(next.log.at(-1)).toMatchObject({ type: 'ACQUIRE_CARD', payload: { slot: 0, card: 'tc' } });
  });

  it('declines with an empty payment: keeps the card and resources, returns the person', () => {
    const next = acquireCard(scenario(0, { kind: 'points', amount: 5 }, { wood: 1 }), 'p1', 0, {});
    expect(next.players[0]!.score).toBe(0);
    expect(next.players[0]!.civCards).toEqual([]);
    expect(next.players[0]!.resources.wood).toBe(1);
    expect(next.cardDisplay[0]!.id).toBe('tc'); // card still on offer
    expect(next.log.at(-1)).toMatchObject({ payload: { declined: true } });
  });

  it('rejects a wrong payment, a slot with no person, and an empty slot', () => {
    // Slot 0 costs exactly 1; paying 2 is illegal.
    expectError(() => acquireCard(scenario(0, { kind: 'none' }, { wood: 2 }), 'p1', 0, { wood: 2 }), 'INVALID_CARD');
    expectError(() => acquireCard(makeState({ phase: 'actions' }), 'p1', 0, { wood: 1 }), 'INVALID_CARD'); // no person
    const emptySlot = withPlacements({ card1: { p1: 1 } }, { phase: 'actions', activePlayerIndex: 0 });
    expectError(() => acquireCard({ ...emptySlot, cardDisplay: emptySlot.cardDisplay.map((c, i) => (i === 0 ? null : c)) }, 'p1', 0, { wood: 1 }), 'INVALID_CARD');
  });
});
