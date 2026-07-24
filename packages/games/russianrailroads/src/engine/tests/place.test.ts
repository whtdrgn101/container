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
    // Turn advanced to the next seat in order.
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex);
    expect(next.version).toBe(1);
    expect(next.log[0]).toMatchObject({ type: 'PLACE', playerId: me, payload: { space: 'coins', gainedCoins: 2 } });
  });

  it('the bottom track space never occupies — many placements share it', () => {
    let state = newGame(2);
    const a = activeId(state);
    state = place(state, a, 'track-bottom');
    const b = activeId(state);
    state = place(state, b, 'track-bottom');
    expect(state.actionSpaces['track-bottom']).toHaveLength(2);
    // No coins gained on the track space (RR1 stub).
    expect(state.log[0]).toMatchObject({ payload: { gainedCoins: 0 } });
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

  it('spends a coin as a worker substitute (pg. 14)', () => {
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
