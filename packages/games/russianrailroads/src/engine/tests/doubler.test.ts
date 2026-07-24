import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, place } from '../actions';
import { DOUBLER_SPACES, DOUBLER_SUPPLY } from '../core';
import type { Locomotive, Route, RouteId, RussianRailroadsState, TrackColor } from '../core';
import { scorePlayer, scoreRoute } from '../internal';
import { VALUATION } from '../core';
import { activeId, expectError, newGame } from './helpers';

/** The active seat with fields overridden. */
function withActive(state: RussianRailroadsState, patch: Partial<RussianRailroadsState['players'][number]>) {
  const active = state.activePlayerIndex;
  return { ...state, players: state.players.map((p, i) => (i === active ? { ...p, ...patch } : p)) };
}

describe('doubler action (pg. 14)', () => {
  it('takes a tile from the supply onto the next Trans-Siberian doubler space and passes the turn', () => {
    const state = newGame(2);
    const me = activeId(state);
    const before = state.players[state.activePlayerIndex]!;
    const next = place(state, me, 'doubler');
    const meNext = next.players.find((p) => p.id === me)!;
    expect(meNext.doublers).toBe(1);
    expect(meNext.workersAvailable).toBe(before.workersAvailable - 1);
    expect(next.supplies.doublers).toBe(DOUBLER_SUPPLY - 1); // one tile left the shared supply
    expect(next.actionSpaces['doubler']).toEqual([{ ownerId: me, workers: 1, coins: 0 }]);
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex); // turn passes
    expect(next.log[0]).toMatchObject({ type: 'PLACE', payload: { space: 'doubler', doubler: 1 } });
  });

  it('may be paid with a coin substitute (pg. 14)', () => {
    const state = withActive(newGame(2), { coins: 1, workersAvailable: 0 });
    const me = activeId(state);
    const next = place(state, me, 'doubler', 1);
    const meNext = next.players.find((p) => p.id === me)!;
    expect(meNext.doublers).toBe(1);
    expect(meNext.coins).toBe(0);
    expect(next.actionSpaces['doubler']).toEqual([{ ownerId: me, workers: 0, coins: 1 }]);
  });

  it('refuses the doubler space when the supply is empty', () => {
    const base = newGame(2);
    const state = { ...base, supplies: { ...base.supplies, doublers: 0 } };
    expectError(() => place(state, activeId(state), 'doubler'), 'DOUBLER_UNAVAILABLE');
    // …and legalActions omits it.
    expect(legalActions(state).some((a) => a.type === 'PLACE' && a.space === 'doubler')).toBe(false);
  });

  it('refuses the doubler space when all doubler spaces are filled', () => {
    const state = withActive(newGame(2), { doublers: DOUBLER_SPACES });
    expectError(() => place(state, activeId(state), 'doubler'), 'DOUBLER_UNAVAILABLE');
    expect(legalActions(state, activeId(state)).some((a) => a.type === 'PLACE' && a.space === 'doubler')).toBe(false);
  });

  it('keeps doubler tiles across rounds while workers reset', () => {
    let state = newGame(2);
    const me = activeId(state);
    state = applyAction(state, me, { type: 'PLACE', space: 'doubler' }); // p1 takes a doubler
    // Pass everyone out to close round 1.
    for (let i = 0; i < 2; i += 1) state = applyAction(state, activeId(state), { type: 'PASS' });
    expect(state.round).toBe(2);
    const meR2 = state.players.find((p) => p.id === me)!;
    expect(meR2.doublers).toBe(1); // persists on the board
    expect(meR2.workersAvailable).toBe(meR2.workersTotal); // workers returned
  });
});

/** A route of `length` empty spaces with the given colour tiles placed at the given 0-based indices. */
function route(id: RouteId, length: number, tiles: Partial<Record<number, TrackColor>>): Route {
  return { id, spaces: Array.from({ length }, (_, i) => tiles[i] ?? null) };
}

describe('doubler scoring — pg. 20 worked example (verbatim)', () => {
  it('doubles the Trans-Siberian space beneath a doubler tile', () => {
    // pg. 20: #6 & #2 locomotives → reach 8. Bronze on spaces 1-3 (frontier at space 3, treating the 2
    // spaces behind as bronze), green on spaces 4-7 (frontier at space 7), space 8 treated as wood. A
    // doubler over space 1. Bronze = 2 pts each, but space 1 scores 4 → 4+2+2 = 8. Green = 1 each → 4.
    // Space 8 = wood = 0. Total = 12.
    const trans = route('transsiberian', 15, { 2: 'bronze', 6: 'green', 8: 'wood' });
    expect(scoreRoute(trans, 8, 1, VALUATION, false)).toBe(12);
    // Without the doubler, the same route scores 10 (bronze 6 + green 4 + wood 0).
    expect(scoreRoute(trans, 8, 0, VALUATION, false)).toBe(10);
  });

  it('scores a whole player with a doubler only on the Trans-Siberian', () => {
    const base = newGame(2).players[0]!;
    const locomotives: Locomotive[] = [
      { number: 6, route: 'transsiberian' },
      { number: 2, route: 'transsiberian' },
    ];
    const player = {
      ...base,
      doublers: 2, // spaces 1 & 2 doubled
      locomotives,
      routes: [
        // reach 8: bronze frontier on space 8, spaces 1-7 behind it treated bronze (2 each); spaces 1 & 2
        // are doubled → (4+4) + 2·6 = 20.
        route('transsiberian', 15, { 7: 'bronze' }),
        route('stpetersburg', 7, { 0: 'wood' }), // no loco → 0
        route('kyiv', 8, { 0: 'wood' }), // no loco → 0
      ],
    };
    // The doubler count is Trans-Siberian's alone — it must not leak onto the other routes (they score 0).
    expect(scorePlayer(player)).toEqual({ playerId: player.id, routes: 20, industry: 0, bonus: 0, gained: 20 });
  });
});
