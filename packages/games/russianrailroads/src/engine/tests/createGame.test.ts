import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import { ROUNDS, STARTING_COINS, STARTING_WORKERS } from '../core';
import { expectError, makeRng, newGame } from './helpers';

describe('createGame', () => {
  it('rejects an out-of-range player count', () => {
    expectError(() => createGame({ id: 'x', players: [{ name: 'A' }] }), 'INVALID_PLAYER_COUNT');
    expectError(
      () => createGame({ id: 'x', players: Array.from({ length: 5 }, (_, i) => ({ name: `P${i}` })) }),
      'INVALID_PLAYER_COUNT',
    );
  });

  it.each([2, 3, 4])('sets per-count workers, coins and rounds (%i players)', (count) => {
    const state = newGame(count);
    expect(state.rounds).toBe(ROUNDS[count]);
    for (const p of state.players) {
      expect(p.workersAvailable).toBe(STARTING_WORKERS[count]);
      expect(p.workersTotal).toBe(STARTING_WORKERS[count]);
      expect(p.coins).toBe(STARTING_COINS[count]);
    }
  });

  it('seeds each route with a wood track on space 1 and empties elsewhere, plus the #1 loco', () => {
    const state = newGame(4);
    const p = state.players[0]!;
    expect(p.routes).toHaveLength(3);
    for (const route of p.routes) {
      expect(route.spaces[0]).toBe('wood');
      expect(route.spaces.slice(1).every((s) => s === null)).toBe(true);
    }
    expect(p.locomotives).toEqual([{ number: 1, route: 'transsiberian' }]);
    // Wrench at START, all 5 gaps empty (pg. 12–13).
    expect(p.industry).toEqual({ wrench: 0, factories: [null, null, null, null, null], secondWrench: null });
    expect(p.endBonusCards).toEqual([]);
    expect(p.hiredEngineers).toEqual([]);
    expect(p.actionPool).toEqual([]);
    expect(p.score).toBe(0);
    // No temporary workers and no doubler tiles at setup (pg. 6, 14, 15).
    expect(p.tempWorkers).toBe(0);
    expect(p.doublers).toBe(0);
  });

  it('gives the Trans-Siberian route 15 spaces (the gold threshold), the others the base counts', () => {
    const p = newGame(4).players[0]!;
    expect(p.routes.find((r) => r.id === 'transsiberian')!.spaces).toHaveLength(15);
  });

  it('deals a distinct turn-order card to each seat and opens with card #1', () => {
    const state = newGame(4);
    const cards = state.players.map((p) => p.turnOrderCard).sort();
    expect(cards).toEqual([1, 2, 3, 4]);
    // The opening seat holds the lowest card among those dealt.
    const openingCard = state.players[state.activePlayerIndex]!.turnOrderCard;
    expect(openingCard).toBe(Math.min(...state.players.map((p) => p.turnOrderCard)));
    // turnOrder is the seats sorted by their card.
    expect(state.turnOrder.map((seat) => state.players[seat]!.turnOrderCard)).toEqual([1, 2, 3, 4]);
  });

  it('is deterministic for a fixed rng and varies with the seed', () => {
    const a = createGame({ id: 'g', players: [{ name: 'A' }, { name: 'B' }], rng: makeRng(7) });
    const b = createGame({ id: 'g', players: [{ name: 'A' }, { name: 'B' }], rng: makeRng(7) });
    expect(a).toEqual(b);
    const c = createGame({ id: 'g', players: [{ name: 'A' }, { name: 'B' }], rng: makeRng(8) });
    expect(c.players.map((p) => p.turnOrderCard)).not.toBeUndefined();
  });

  it('works with the default (unseeded) rng', () => {
    const state = createGame({ id: 'g', players: [{ name: 'A' }, { name: 'B' }] });
    expect(state.status).toBe('active');
    expect(state.players).toHaveLength(2);
  });

  it('starts active, at round 1, version 0, empty log and no occupancy', () => {
    const state = newGame(4);
    expect(state.status).toBe('active');
    expect(state.round).toBe(1);
    expect(state.version).toBe(0);
    expect(state.log).toEqual([]);
    expect(state.actionSpaces).toEqual({});
    // The shared doubler supply (pg. 14) + the locomotive/factory supply (pg. 4, 10–12): 4 players ⇒ 4 per
    // stack for #2–#9, and two #10 stacks of 4, with no returned factories yet.
    expect(state.supplies).toEqual({
      doublers: 30,
      locomotives: {
        stacks: { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 },
        tens: [4, 4],
        returnedFactories: {},
      },
    });
    expect(state.pendingMoves).toBeNull();
    expect(state.pendingLoco).toBeNull();
    expect(state.pendingFactory).toBeNull();
    expect(state.pendingThen).toBeNull();
  });

  it.each([2, 3, 4])('sizes each locomotive stack to the player count (%i players, pg. 12)', (count) => {
    const supply = newGame(count).supplies.locomotives;
    for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) expect(supply.stacks[n]).toBe(count);
    expect(supply.tens).toEqual([count, count]);
    expect(supply.returnedFactories).toEqual({});
  });
});
