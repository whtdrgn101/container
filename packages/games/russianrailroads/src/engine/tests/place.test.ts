import { describe, expect, it } from 'vitest';
import { applyAction, place } from '../actions';
import { COINS_PER_ACTION } from '../core';
import type { RussianRailroadsState } from '../core';
import { activeId, expectError, newGame } from './helpers';

/** A copy of `state` with the active seat's fields overridden. */
function withActive(state: RussianRailroadsState, patch: Partial<RussianRailroadsState['players'][number]>) {
  const active = state.activePlayerIndex;
  return { ...state, players: state.players.map((p, i) => (i === active ? { ...p, ...patch } : p)) };
}

/** Fill every route so no wood track can advance (all tracks at the route end). */
function maxedRoutes(state: RussianRailroadsState): RussianRailroadsState {
  const active = state.activePlayerIndex;
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === active
        ? {
            ...p,
            routes: p.routes.map((r) => ({
              ...r,
              spaces: r.spaces.map((_, idx) => (idx === r.spaces.length - 1 ? ('wood' as const) : null)),
            })),
          }
        : p,
    ),
  };
}

describe('place', () => {
  it('take-2-coins pays the seat 2 coins and occupies the space', () => {
    const state = newGame(4);
    const me = activeId(state);
    const before = state.players[state.activePlayerIndex]!.coins;
    const next = place(state, me, 'coins');
    const meState = next.players.find((p) => p.id === me)!;
    expect(meState.coins).toBe(before + COINS_PER_ACTION);
    expect(meState.workersAvailable).toBe(state.players[state.activePlayerIndex]!.workersAvailable - 1);
    expect(next.actionSpaces['coins']).toEqual([{ ownerId: me, workers: 1, coins: 0 }]);
    // Turn advanced to the next seat in order; no lock.
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex);
    expect(next.pendingMoves).toBeNull();
    expect(next.version).toBe(1);
    expect(next.log[0]).toMatchObject({ type: 'PLACE', playerId: me, payload: { space: 'coins', gainedCoins: 2 } });
  });

  it('a track space sets the pending lock and keeps the turn with the placer', () => {
    const state = newGame(4);
    const me = activeId(state);
    const next = place(state, me, 'track-wood-2'); // 2 workers → 3 wood moves
    expect(next.pendingMoves).toEqual({ remaining: 3, colors: ['wood'] });
    // The placer stays on the clock to resolve the moves.
    expect(next.activePlayerIndex).toBe(state.activePlayerIndex);
    expect(next.players.find((p) => p.id === me)!.workersAvailable).toBe(
      state.players[state.activePlayerIndex]!.workersAvailable - 2,
    );
    expect(next.actionSpaces['track-wood-2']).toEqual([{ ownerId: me, workers: 2, coins: 0 }]);
    expect(next.log[0]).toMatchObject({ type: 'PLACE', payload: { space: 'track-wood-2', moves: 3 } });
  });

  it('the worker+coin space costs a mandatory coin on top of the worker (no substitution)', () => {
    const state = newGame(4); // 1 coin
    const me = activeId(state);
    const next = place(state, me, 'track-coin');
    expect(next.pendingMoves).toEqual({ remaining: 2, colors: ['wood'] });
    const meState = next.players.find((p) => p.id === me)!;
    expect(meState.coins).toBe(0); // the one coin was spent
    expect(meState.workersAvailable).toBe(state.players[state.activePlayerIndex]!.workersAvailable - 1);
    expect(next.actionSpaces['track-coin']).toEqual([{ ownerId: me, workers: 1, coins: 1 }]);
  });

  it('rejects paying the worker+coin space with a coin substitution', () => {
    const state = newGame(4);
    expectError(() => place(state, activeId(state), 'track-coin', 1), 'INSUFFICIENT_WORKERS');
  });

  it('rejects the worker+coin space when the seat holds no coin', () => {
    const state = withActive(newGame(4), { coins: 0 });
    expectError(() => place(state, activeId(state), 'track-coin'), 'INSUFFICIENT_WORKERS');
  });

  it('a track space with no legal step forfeits the moves and passes the turn', () => {
    const state = maxedRoutes(newGame(4));
    const me = activeId(state);
    const next = place(state, me, 'track-wood-1');
    // No lock is set (nothing to move); the turn advances immediately.
    expect(next.pendingMoves).toBeNull();
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex);
    expect(next.log[0]).toMatchObject({ type: 'PLACE', payload: { space: 'track-wood-1', moves: 0 } });
  });

  it('the bottom track space never occupies — many placements share it', () => {
    const state = newGame(2);
    const a = activeId(state);
    const afterA = place(state, a, 'track-bottom');
    // Two placements on the same never-occupied space (simulating a later round; occupancy would otherwise
    // block it). It sets a 1-move wood lock.
    expect(afterA.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
    const shared = { ...afterA, pendingMoves: null };
    const afterB = place(shared, a, 'track-bottom');
    expect(afterB.actionSpaces['track-bottom']).toHaveLength(2);
  });

  it('rejects an occupied normal space', () => {
    let state = newGame(2);
    state = place(state, activeId(state), 'coins');
    expectError(() => place(state, activeId(state), 'coins'), 'SPACE_OCCUPIED');
  });

  it('rejects an unknown space', () => {
    const state = newGame(2);
    expectError(() => place(state, activeId(state), 'nope'), 'UNKNOWN_SPACE');
  });

  it('spends a coin as a worker substitute on the coins space (pg. 14)', () => {
    const state = newGame(4); // starts with 1 coin
    const me = activeId(state);
    const next = place(state, me, 'coins', 1); // pay the 1-worker requirement with a coin
    const meState = next.players.find((p) => p.id === me)!;
    // Spent 1 coin, gained 2 from the space → net +1; no worker used.
    expect(meState.coins).toBe(state.players[state.activePlayerIndex]!.coins - 1 + COINS_PER_ACTION);
    expect(meState.workersAvailable).toBe(state.players[state.activePlayerIndex]!.workersAvailable);
    expect(next.actionSpaces['coins']).toEqual([{ ownerId: me, workers: 0, coins: 1 }]);
  });

  it('rejects paying with more coins than the space requires, or a negative count', () => {
    const state = newGame(4);
    const me = activeId(state);
    expectError(() => place(state, me, 'coins', 2), 'INSUFFICIENT_WORKERS');
    expectError(() => place(state, me, 'coins', -1), 'INSUFFICIENT_WORKERS');
  });

  it('rejects placing without enough workers', () => {
    const state = withActive(newGame(4), { workersAvailable: 0 });
    expectError(() => place(state, activeId(state), 'coins'), 'INSUFFICIENT_WORKERS');
  });

  it('rejects paying with a coin the seat does not hold', () => {
    const state = withActive(newGame(4), { coins: 0 });
    expectError(() => place(state, activeId(state), 'coins', 1), 'INSUFFICIENT_WORKERS');
  });

  it('is reachable through applyAction with a coins payload', () => {
    const state = newGame(4);
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'PLACE', space: 'coins', coins: 1 });
    expect(next.actionSpaces['coins']).toEqual([{ ownerId: me, workers: 0, coins: 1 }]);
  });
});
