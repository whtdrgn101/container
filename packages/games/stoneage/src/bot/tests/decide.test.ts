import { describe, expect, it } from 'vitest';
import { applyAction, createGame, viewFor } from '../../engine';
import type { StoneAgeState } from '../../engine';
import { decide } from '../decide';

/** A fresh 2-player game (deck order — no rng). */
function base(): StoneAgeState {
  return createGame({ id: 'g', players: [{ name: 'Ann' }, { name: 'Bob' }] });
}
const view = (state: StoneAgeState) => viewFor(state, state.players[state.activePlayerIndex]!.id);
const rollDice = (n: number) => Array.from({ length: n }, () => 3);

describe('decide', () => {
  it('refuses an ended game and an off-turn seat', () => {
    expect(() => decide(view({ ...base(), status: 'ended', results: [], winnerIds: [] }), 'p1')).toThrow(/ended/);
    expect(() => decide(view(base()), 'p2')).toThrow(/not bot seat/);
  });

  it('places a legal worker in the placement phase', () => {
    const state = base();
    const action = decide(view(state), 'p1');
    expect(action.type).toBe('PLACE');
    expect(() => applyAction(state, 'p1', action)).not.toThrow(); // the engine accepts it
  });

  it('feeds in the feeding phase', () => {
    const state = { ...base(), phase: 'feeding' as const, activePlayerIndex: 0 };
    expect(decide(view(state), 'p1')).toEqual({ type: 'FEED', payWithResources: true });
  });

  it('rolls a gather (needing injected dice), then takes the pending roll', () => {
    const acting: StoneAgeState = {
      ...base(),
      phase: 'actions',
      activePlayerIndex: 0,
      placements: { ...base().placements, forest: { p1: 2 } },
    };
    // Without dice it refuses; with dice it produces a legal GATHER.
    expect(() => decide(view(acting), 'p1')).toThrow(/rollDice/);
    const rolled = decide(view(acting), 'p1', { rollDice });
    expect(rolled).toMatchObject({ type: 'GATHER', place: 'forest' });
    const next = applyAction(acting, 'p1', rolled);
    // Now a roll is pending → the bot takes it.
    expect(decide(view(next), 'p1')).toMatchObject({ type: 'TAKE_GATHER' });
  });

  it('uses a non-dice place', () => {
    const acting: StoneAgeState = {
      ...base(),
      phase: 'actions',
      activePlayerIndex: 0,
      placements: { ...base().placements, field: { p1: 1 } },
    };
    expect(decide(view(acting), 'p1')).toEqual({ type: 'USE', place: 'field' });
  });

  it('declines a building when too poor, and buys one it can afford', () => {
    const s = base();
    const onBuilding: StoneAgeState = {
      ...s,
      phase: 'actions',
      activePlayerIndex: 0,
      placements: { ...s.placements, building1: { p1: 1 } },
    };
    // Deck order: building1 top is b01 (2 wood + 1 brick). Broke → decline (empty payment).
    expect(decide(view(onBuilding), 'p1')).toEqual({ type: 'BUILD', stack: 0, resources: {} });
    // With the resources, it buys.
    const rich = {
      ...onBuilding,
      players: onBuilding.players.map((p, i) =>
        i === 0 ? { ...p, resources: { wood: 2, brick: 1, stone: 0, gold: 0 } } : p,
      ),
    };
    const buy = decide(view(rich), 'p1');
    expect(buy.type).toBe('BUILD');
    expect(() => applyAction(rich, 'p1', buy)).not.toThrow();
  });

  it('acquires a card it can afford', () => {
    const s = base();
    const onCard: StoneAgeState = {
      ...s,
      phase: 'actions',
      activePlayerIndex: 0,
      placements: { ...s.placements, card1: { p1: 1 } },
      players: s.players.map((p, i) => (i === 0 ? { ...p, resources: { wood: 1, brick: 0, stone: 0, gold: 0 } } : p)),
    };
    const action = decide(view(onCard), 'p1'); // card1 costs 1 resource
    expect(action).toMatchObject({ type: 'ACQUIRE_CARD', slot: 0 });
    expect(() => applyAction(onCard, 'p1', action)).not.toThrow();
  });
});
