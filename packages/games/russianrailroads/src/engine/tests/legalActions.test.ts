import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { RussianRailroadsState } from '../core';
import { activeId, newGame } from './helpers';

/** Every distinct space id a PLACE action targets in `actions`. */
const placedSpaces = (actions: ReturnType<typeof legalActions>) =>
  new Set(actions.filter((a) => a.type === 'PLACE').map((a) => (a as { space: string }).space));

describe('legalActions', () => {
  it('offers PASS plus payable placements on every open track/coin space', () => {
    const state = newGame(4); // 5 workers, 1 coin
    const actions = legalActions(state);
    expect(actions.some((a) => a.type === 'PASS')).toBe(true);
    expect(placedSpaces(actions)).toEqual(
      new Set(['coins', 'track-wood-1', 'track-wood-2', 'track-coin', 'track-bottom']),
    );
    // The coins space offers a worker and a coin variant.
    const coinsPlacements = actions.filter((a) => a.type === 'PLACE' && a.space === 'coins');
    expect(coinsPlacements).toContainEqual({ type: 'PLACE', space: 'coins' });
    expect(coinsPlacements).toContainEqual({ type: 'PLACE', space: 'coins', coins: 1 });
    // The worker+coin space has exactly one variant (no substitution).
    const coinTrack = actions.filter((a) => a.type === 'PLACE' && a.space === 'track-coin');
    expect(coinTrack).toEqual([{ type: 'PLACE', space: 'track-coin' }]);
  });

  it('enumerates single MOVE_TRACK steps while a lock is set (no PLACE/PASS)', () => {
    const base = newGame(4);
    const state = applyAction(base, activeId(base), { type: 'PLACE', space: 'track-wood-2' });
    const actions = legalActions(state);
    expect(actions).toEqual([
      { type: 'MOVE_TRACK', route: 'transsiberian', color: 'wood' },
      { type: 'MOVE_TRACK', route: 'stpetersburg', color: 'wood' },
      { type: 'MOVE_TRACK', route: 'kyiv', color: 'wood' },
    ]);
  });

  it('omits a track space when no track could advance from it', () => {
    // Every wood track parked at the end of its route → no legal step, so the track spaces drop out.
    const base = newGame(4);
    const maxed: RussianRailroadsState = {
      ...base,
      players: base.players.map((p, i) =>
        i === base.activePlayerIndex
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
    expect(placedSpaces(legalActions(maxed))).toEqual(new Set(['coins']));
  });

  it('drops an occupied space but keeps the never-occupied bottom space', () => {
    let state = newGame(2);
    // Occupy 'coins'; the placer keeps no lock, so the turn advances — put occupancy in by hand instead so
    // the same seat can be queried.
    state = { ...state, actionSpaces: { coins: [{ ownerId: 'p1', workers: 1, coins: 0 }] } };
    const spaces = placedSpaces(legalActions(state));
    expect(spaces.has('coins')).toBe(false);
    expect(spaces.has('track-bottom')).toBe(true);
  });

  it('offers no coin variant when the seat holds no coins', () => {
    const state = newGame(4);
    const broke = {
      ...state,
      players: state.players.map((p, i) => (i === state.activePlayerIndex ? { ...p, coins: 0 } : p)),
    };
    const actions = legalActions(broke);
    // No coin-substitution variants, and the worker+coin space is unaffordable.
    expect(actions.every((a) => a.type !== 'PLACE' || (a as { coins?: number }).coins === undefined)).toBe(true);
    expect(placedSpaces(actions).has('track-coin')).toBe(false);
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
