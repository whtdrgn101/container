import { describe, expect, it } from 'vitest';
import type { CivCard, Resource, StoneAgePlayer } from '../core';
import {
  applyCardEffect,
  cardIndex,
  cardPaymentError,
  cardPlaceId,
  dealCards,
  isCardPlace,
  refillDisplay,
} from '../internal';

/** A player owning the given resources (everything else at its starting value). */
const player = (resources: Partial<Record<Resource, number>> = {}): StoneAgePlayer => ({
  id: 'p1',
  name: 'A',
  people: 5,
  food: 12,
  foodTrack: 0,
  tools: [],
  toolsUsed: [],
  resources: { wood: 0, brick: 0, stone: 0, gold: 0, ...resources },
  civCards: [],
  buildings: 0,
  score: 0,
});

const card = (id: string, effect: CivCard['effect']): CivCard => ({ id, effect, scoring: { kind: 'green', symbol: 'art' } });

describe('card slot helpers', () => {
  it('identifies and indexes card slots', () => {
    expect(isCardPlace('card1')).toBe(true);
    expect(isCardPlace('building1')).toBe(false);
    expect(cardIndex('card3')).toBe(2);
    expect(cardPlaceId(0)).toBe('card1');
  });
});

describe('dealCards', () => {
  it('deals a 4-card display off the top and keeps the rest as the deck (deck order without rng)', () => {
    const { display, deck } = dealCards();
    expect(display.map((c) => c!.id)).toEqual(['cv01', 'cv02', 'cv03', 'cv04']);
    expect(deck).toHaveLength(32);
  });

  it('shuffles with the injected rng', () => {
    const shuffled = dealCards(() => 0);
    expect(shuffled.display.map((c) => c!.id)).not.toEqual(['cv01', 'cv02', 'cv03', 'cv04']);
  });
});

describe('refillDisplay', () => {
  it('slides kept cards left, then fills the empty slots from the deck', () => {
    const a = card('a', { kind: 'none' });
    const d = card('d', { kind: 'none' });
    const x = card('x', { kind: 'none' });
    const y = card('y', { kind: 'none' });
    const { display, deck } = refillDisplay([a, null, null, d], [x, y, card('z', { kind: 'none' })]);
    expect(display.map((c) => c?.id)).toEqual(['a', 'd', 'x', 'y']); // consolidated then refilled
    expect(deck.map((c) => c.id)).toEqual(['z']);
  });

  it('leaves slots empty when the deck runs dry', () => {
    const a = card('a', { kind: 'none' });
    const { display } = refillDisplay([a, null, null, null], []);
    expect(display.map((c) => c?.id)).toEqual(['a', undefined, undefined, undefined]);
  });
});

describe('cardPaymentError', () => {
  it('requires exactly the slot cost, of resources the player owns', () => {
    expect(cardPaymentError(0, { wood: 1 }, player({ wood: 1 }))).toBeNull(); // slot 0 costs 1
    expect(cardPaymentError(1, { wood: 1, brick: 1 }, player({ wood: 1, brick: 1 }))).toBeNull(); // slot 1 costs 2, any kinds
    expect(cardPaymentError(0, { wood: 2 }, player({ wood: 2 }))).toMatch(/exactly 1 resources/);
    expect(cardPaymentError(1, { wood: 2 }, player({ wood: 1 }))).toMatch(/Not enough wood/);
    expect(cardPaymentError(0, { wood: 1.5 }, player({ wood: 2 }))).toMatch(/whole number/);
  });
});

describe('applyCardEffect', () => {
  it('applies each immediate effect kind', () => {
    expect(applyCardEffect(player(), card('c', { kind: 'resource', resource: 'stone', amount: 2 })).resources.stone).toBe(2);
    expect(applyCardEffect(player(), card('c', { kind: 'food', amount: 3 })).food).toBe(15);
    expect(applyCardEffect(player(), card('c', { kind: 'foodTrack', amount: 1 })).foodTrack).toBe(1);
    // The food track ends at 10 (pg. 2) — a food-track card at the top is clamped like the field.
    expect(applyCardEffect({ ...player(), foodTrack: 10 }, card('c', { kind: 'foodTrack', amount: 1 })).foodTrack).toBe(10);
    expect(applyCardEffect(player(), card('c', { kind: 'points', amount: 4 })).score).toBe(4);
    const tooled = applyCardEffect(player(), card('c', { kind: 'tool' }));
    expect(tooled.tools).toEqual([1]);
    expect(tooled.toolsUsed).toEqual([false]);
    // A tool card at three tools upgrades the lowest tile (no new tile) and keeps the used flags.
    const upgraded = applyCardEffect({ ...player(), tools: [1, 1, 2], toolsUsed: [true, false, false] }, card('c', { kind: 'tool' }));
    expect(upgraded.tools).toEqual([2, 1, 2]);
    expect(upgraded.toolsUsed).toEqual([true, false, false]);
    expect(applyCardEffect(player({ wood: 1 }), card('c', { kind: 'none' })).resources.wood).toBe(1); // unchanged
  });
});
