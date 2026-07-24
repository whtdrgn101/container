import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, moveTrack, place } from '../actions';
import { routeColors, UNLOCK_SPACE } from '../core';
import type { RouteId, RussianRailroadsState, TrackColor } from '../core';
import { accessibleColors, advanceTrack, canAdvance } from '../internal';
import { activeId, expectError, newGame } from './helpers';

/** The active seat with its three routes' spaces overridden (any omitted route keeps its setup spaces). */
function withRoutes(
  state: RussianRailroadsState,
  spacesByRoute: Partial<Record<RouteId, readonly (TrackColor | null)[]>>,
): RussianRailroadsState {
  const active = state.activePlayerIndex;
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === active ? { ...p, routes: p.routes.map((r) => ({ ...r, spaces: spacesByRoute[r.id] ?? r.spaces })) } : p,
    ),
  };
}

/** A Trans-Siberian route with the wood tile on the given 1-based space (rest empty), length 15. */
function transWoodAt(space: number): readonly (TrackColor | null)[] {
  return Array.from({ length: 15 }, (_, i) => (i === space - 1 ? 'wood' : null));
}

describe('colour access ladder (pg. 8–9)', () => {
  it('unlocks colours as the wood track reaches the Trans-Siberian threshold spaces', () => {
    const base = newGame(2);
    const at = (space: number) =>
      accessibleColors(withRoutes(base, { transsiberian: transWoodAt(space) }).players[base.activePlayerIndex]!);
    // Setup: wood on space 1 → wood only.
    expect(accessibleColors(base.players[base.activePlayerIndex]!)).toEqual(['wood']);
    expect(at(1)).toEqual(['wood']);
    // Space 2 → green (UNLOCK_SPACE.green); still no bronze until space 6.
    expect(at(UNLOCK_SPACE.green)).toEqual(['wood', 'green']);
    expect(at(5)).toEqual(['wood', 'green']);
    expect(at(UNLOCK_SPACE.bronze)).toEqual(['wood', 'green', 'bronze']);
    expect(at(UNLOCK_SPACE.silver)).toEqual(['wood', 'green', 'bronze', 'silver']);
    // Space 15 → all five (the gold threshold needs the 15-space Trans-Siberian).
    expect(at(UNLOCK_SPACE.gold)).toEqual(['wood', 'green', 'bronze', 'silver', 'gold']);
  });

  it('reads colour access off the Trans-Siberian even when other routes are further', () => {
    const base = newGame(2);
    // A route with no wood tile at all contributes nothing (never happens in a real game, but the reducer
    // must not crash): here the Trans-Siberian still governs access.
    const p = withRoutes(base, {
      transsiberian: transWoodAt(6),
      kyiv: [null, null, null, null, null, null, null, null],
    }).players[base.activePlayerIndex]!;
    expect(accessibleColors(p)).toEqual(['wood', 'green', 'bronze']);
  });

  it('falls back to wood-only when there is no Trans-Siberian route at all', () => {
    const base = newGame(2).players[0]!;
    const noTrans = { ...base, routes: base.routes.filter((r) => r.id !== 'transsiberian') };
    expect(accessibleColors(noTrans)).toEqual(['wood']);
  });
});

describe('per-route colour availability (pg. 9 / board art)', () => {
  it('exposes the route colour sets and reconciles the pg. 3 supply counts', () => {
    expect(routeColors('transsiberian')).toEqual(['wood', 'green', 'bronze', 'silver', 'gold']);
    expect(routeColors('stpetersburg')).toEqual(['wood', 'green', 'bronze', 'silver']);
    expect(routeColors('kyiv')).toEqual(['wood', 'green', 'bronze']);
    expect(routeColors('narnia' as RouteId)).toEqual([]); // unknown id
    // Each colour appears on as many routes as the contents list has tracks: 3/3/3/2/1.
    const onRoutes = (c: TrackColor) =>
      (['transsiberian', 'stpetersburg', 'kyiv'] as RouteId[]).filter((r) => routeColors(r).includes(c)).length;
    expect([onRoutes('wood'), onRoutes('green'), onRoutes('bronze'), onRoutes('silver'), onRoutes('gold')]).toEqual([
      3, 3, 3, 2, 1,
    ]);
  });

  it('refuses a colour a route does not support even once it is accessible', () => {
    const base = newGame(2);
    // Gold accessible (wood on space 15), but Kyiv accepts only wood/green/bronze.
    const kyivRoute = {
      id: 'kyiv' as RouteId,
      spaces: [null, null, null, null, null, null, null, null] as (TrackColor | null)[],
    };
    expect(canAdvance(kyivRoute, 'gold')).toBe(false);
    expect(canAdvance(kyivRoute, 'silver')).toBe(false);
    expect(canAdvance(kyivRoute, 'green')).toBe(true); // green enters at space 1
    // Over a lock: a gold lock on a state whose only accessible route for gold is the Trans-Siberian.
    const locked = withRoutes(
      { ...base, pendingMoves: { remaining: 1, colors: ['gold'] } },
      { transsiberian: transWoodAt(15) },
    );
    const me = activeId(locked);
    expectError(() => moveTrack(locked, me, 'kyiv', 'gold'), 'ILLEGAL_TRACK_MOVE');
    // …but the Trans-Siberian accepts it (gold enters at space 1, which is empty here).
    const built = moveTrack(
      withRoutes(locked, { transsiberian: [null, ...transWoodAt(15).slice(1)] }),
      me,
      'transsiberian',
      'gold',
    );
    expect(built.players[locked.activePlayerIndex]!.routes.find((r) => r.id === 'transsiberian')!.spaces[0]).toBe(
      'gold',
    );
  });
});

describe('a new colour enters at space 1 (pg. 9 example)', () => {
  it('advanceTrack places a colour not yet on the route onto space 1, then relocates it forward', () => {
    const empty = {
      id: 'stpetersburg' as RouteId,
      spaces: [null, null, null, null, null, null, null] as (TrackColor | null)[],
    };
    const entered = advanceTrack(empty, 'green');
    expect(entered.spaces[0]).toBe('green'); // "you place your green track on space 1 of a route"
    const moved = advanceTrack(entered, 'green');
    expect(moved.spaces).toEqual(
      ['green', null, null, null, null, null, null].map((v, i) => (i === 1 ? 'green' : null)),
    );
  });

  it('drives the pg. 9 example over MOVE_TRACK: green enters at space 1, then moves 1 forward', () => {
    const base = newGame(2);
    // Green accessible (wood past space 2); place on the 1-worker green space → a 2-move green lock.
    // Wood on Trans-Siberian space 6 leaves space 1 empty, so green can enter there.
    let state = withRoutes(base, { transsiberian: transWoodAt(6) });
    const me = activeId(state);
    state = place(state, me, 'track-green-1');
    expect(state.pendingMoves).toEqual({ remaining: 2, colors: ['green'] });
    state = moveTrack(state, me, 'transsiberian'); // move 1: green enters space 1
    expect(state.players[base.activePlayerIndex]!.routes.find((r) => r.id === 'transsiberian')!.spaces[0]).toBe(
      'green',
    );
    state = moveTrack(state, me, 'transsiberian'); // move 2: green → space 2
    const ts = state.players[base.activePlayerIndex]!.routes.find((r) => r.id === 'transsiberian')!;
    expect(ts.spaces[0]).toBeNull();
    expect(ts.spaces[1]).toBe('green');
    expect(ts.spaces[5]).toBe('wood'); // the wood frontier is untouched
    expect(state.pendingMoves).toBeNull(); // lock spent, turn passes
  });

  it('legalActions offers the green spaces (and a multi-colour track-coin lock) once green is accessible', () => {
    const base = newGame(2);
    const state = withRoutes(base, { transsiberian: transWoodAt(2) }); // green unlocked
    const spaces = new Set(
      legalActions(state, activeId(state))
        .filter((a) => a.type === 'PLACE')
        .map((a) => (a as { space: string }).space),
    );
    expect(spaces.has('track-green-1')).toBe(true);
    expect(spaces.has('track-green-2')).toBe(true);
    expect(spaces.has('track-bronze-1')).toBe(false); // bronze not yet accessible
    // The worker+coin space now offers wood + green.
    const withCoin = place(
      { ...state, players: state.players.map((p, i) => (i === base.activePlayerIndex ? { ...p, coins: 1 } : p)) },
      activeId(state),
      'track-coin',
    );
    expect(withCoin.pendingMoves).toEqual({ remaining: 2, colors: ['wood', 'green'] });
  });
});

describe('pg. 8 Example 2 — splitting wood moves across routes', () => {
  it('a 3-move wood action advances one route 2 spaces and another route 1 space (3 tracks built)', () => {
    const base = newGame(2);
    const me = activeId(base);
    let state = applyAction(base, me, { type: 'PLACE', space: 'track-wood-2' }); // 2 workers → 3 wood moves
    expect(state.pendingMoves).toEqual({ remaining: 3, colors: ['wood'] });
    state = applyAction(state, me, { type: 'MOVE_TRACK', route: 'transsiberian' }); // wood → space 2
    state = applyAction(state, me, { type: 'MOVE_TRACK', route: 'transsiberian' }); // wood → space 3
    state = applyAction(state, me, { type: 'MOVE_TRACK', route: 'stpetersburg' }); // a different route, 1 space
    const p = state.players[base.activePlayerIndex]!;
    expect(p.routes.find((r) => r.id === 'transsiberian')!.spaces[2]).toBe('wood'); // advanced 2 → on space 3
    expect(p.routes.find((r) => r.id === 'stpetersburg')!.spaces[1]).toBe('wood'); // advanced 1 → on space 2
    expect(state.pendingMoves).toBeNull(); // "The action is then completed."
  });
});
