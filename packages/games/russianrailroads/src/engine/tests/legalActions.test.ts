import { describe, expect, it } from 'vitest';
import { legalActions, place } from '../actions';
import type { RussianRailroadsState } from '../core';
import { activeId, newGame } from './helpers';

/** Every distinct space id a PLACE action targets in `actions`. */
const placedSpaces = (actions: ReturnType<typeof legalActions>) =>
  new Set(actions.filter((a) => a.type === 'PLACE').map((a) => (a as { space: string }).space));

describe('legalActions', () => {
  it('offers PASS plus a worker and a coin placement on each open space', () => {
    const state = newGame(4); // 5 workers, 1 coin → both pay-ways available
    const actions = legalActions(state);
    expect(actions.some((a) => a.type === 'PASS')).toBe(true);
    expect(placedSpaces(actions)).toEqual(new Set(['coins', 'track-bottom']));
    // Each space has a worker variant and a coin variant.
    const coinsPlacements = actions.filter((a) => a.type === 'PLACE' && a.space === 'coins');
    expect(coinsPlacements).toContainEqual({ type: 'PLACE', space: 'coins' });
    expect(coinsPlacements).toContainEqual({ type: 'PLACE', space: 'coins', coins: 1 });
  });

  it('drops an occupied space but keeps the never-occupied track space', () => {
    let state = newGame(2);
    state = place(state, activeId(state), 'coins'); // occupies 'coins'
    state = place(state, activeId(state), 'track-bottom'); // track space accumulates, never occupies
    const actions = legalActions(state);
    // 'coins' is occupied → gone; 'track-bottom' still offered despite a placement on it.
    expect(placedSpaces(actions)).toEqual(new Set(['track-bottom']));
  });

  it('offers no coin variant when the seat holds no coins', () => {
    const state = newGame(4);
    const broke = {
      ...state,
      players: state.players.map((p, i) => (i === state.activePlayerIndex ? { ...p, coins: 0 } : p)),
    };
    const actions = legalActions(broke);
    expect(actions.every((a) => a.type !== 'PLACE' || (a as { coins?: number }).coins === undefined)).toBe(true);
  });

  it('offers nothing to a non-active seat, a passed seat, or once ended', () => {
    const state = newGame(4);
    const other = state.players.find((_, i) => i !== state.activePlayerIndex)!.id;
    expect(legalActions(state, other)).toEqual([]);

    const activePassed: RussianRailroadsState = {
      ...state,
      players: state.players.map((p, i) => (i === state.activePlayerIndex ? { ...p, passed: true } : p)),
    };
    expect(legalActions(activePassed, activeId(state))).toEqual([]);

    const ended = { ...state, status: 'ended' as const, results: [], winnerIds: [] };
    expect(legalActions(ended)).toEqual([]);
  });
});
