import { describe, expect, it } from 'vitest';
import { applyAction, moveTrack, place } from '../actions';
import type { PendingMoves, RussianRailroadsState, TrackColor } from '../core';
import { activeId, expectError, newGame } from './helpers';

/** Set the active seat's routes and pending lock directly, for the edge cases. */
function locked(
  state: RussianRailroadsState,
  spacesByRoute: Partial<Record<string, readonly (TrackColor | null)[]>>,
  pending: PendingMoves,
): RussianRailroadsState {
  const active = state.activePlayerIndex;
  return {
    ...state,
    pendingMoves: pending,
    players: state.players.map((p, i) =>
      i === active ? { ...p, routes: p.routes.map((r) => ({ ...r, spaces: spacesByRoute[r.id] ?? r.spaces })) } : p,
    ),
  };
}

/** A named player's route by id. */
const routeOf = (state: RussianRailroadsState, playerId: string, id: string) =>
  state.players.find((p) => p.id === playerId)!.routes.find((r) => r.id === id)!;

describe('moveTrack', () => {
  it('advances the wood track one space and decrements the lock, keeping the turn', () => {
    const start = newGame(2);
    const me = activeId(start);
    const state = place(start, me, 'track-wood-1'); // 2 wood moves
    const next = moveTrack(state, me, 'transsiberian');
    const route = routeOf(next, me, 'transsiberian');
    expect(route.spaces[0]).toBeNull(); // the tile relocated off space 1…
    expect(route.spaces[1]).toBe('wood'); // …onto space 2
    expect(next.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
    expect(next.activePlayerIndex).toBe(state.activePlayerIndex);
    expect(next.log.at(-1)).toMatchObject({
      type: 'MOVE_TRACK',
      payload: { route: 'transsiberian', color: 'wood', remaining: 1 },
    });
  });

  it('splits moves across routes and clears the lock on the last step, passing the turn', () => {
    const start = newGame(2);
    const me = activeId(start);
    let state = place(start, me, 'track-wood-1'); // 2 moves
    state = moveTrack(state, me, 'transsiberian'); // move 1
    const done = moveTrack(state, me, 'kyiv'); // move 2 → lock clears
    expect(done.pendingMoves).toBeNull();
    expect(done.activePlayerIndex).not.toBe(state.activePlayerIndex);
    expect(routeOf(done, me, 'transsiberian').spaces[1]).toBe('wood');
    expect(routeOf(done, me, 'kyiv').spaces[1]).toBe('wood');
    expect(done.log.at(-1)).toMatchObject({ type: 'MOVE_TRACK', payload: { done: true, remaining: 0 } });
  });

  it('auto-releases the lock when moves remain but no track can advance (forfeit)', () => {
    // A 3-move lock, but only two routes can ever advance (kyiv's track is already at the end). Two moves
    // exhaust them and the third move is forfeit — the lock releases with `remaining` still > 0.
    const start = newGame(2);
    const me = activeId(start);
    const state = locked(
      start,
      {
        transsiberian: ['wood', null], // one move → at the end
        stpetersburg: ['wood', null], // one move → at the end
        kyiv: [null, null, null, null, null, null, null, 'wood'], // already at the end
      },
      { remaining: 3, colors: ['wood'] },
    );
    let s = moveTrack(state, me, 'transsiberian');
    s = moveTrack(s, me, 'stpetersburg');
    // Nothing left to advance, but a move still nominally remains → lock releases, move forfeit.
    expect(s.pendingMoves).toBeNull();
    expect(s.activePlayerIndex).not.toBe(state.activePlayerIndex);
  });

  it('rejects an unknown route', () => {
    const start = newGame(2);
    const me = activeId(start);
    const state = place(start, me, 'track-wood-1');
    expectError(() => moveTrack(state, me, 'narnia' as 'kyiv'), 'UNKNOWN_ROUTE');
  });

  it('rejects a colour the lock does not allow, and requires a choice when ambiguous', () => {
    const start = newGame(2);
    const me = activeId(start);
    const woodLock = place(start, me, 'track-wood-1');
    // A wood-only lock refuses green.
    expectError(() => moveTrack(woodLock, me, 'transsiberian', 'green'), 'INVALID_TRACK_COLOR');
    // A multi-colour lock with no colour given is ambiguous → refused (RR3 will send the colour).
    const ambiguous = locked(start, {}, { remaining: 1, colors: ['wood', 'green'] });
    expectError(() => moveTrack(ambiguous, me, 'transsiberian'), 'INVALID_TRACK_COLOR');
  });

  it('rejects a move onto an occupied space (no leapfrog) or at the route end', () => {
    const start = newGame(2);
    const me = activeId(start);
    // Wood sits directly behind a green track: it cannot advance into the occupied space.
    const blocked = locked(start, { transsiberian: ['wood', 'green', null] }, { remaining: 1, colors: ['wood'] });
    expectError(() => moveTrack(blocked, me, 'transsiberian'), 'ILLEGAL_TRACK_MOVE');
    // Wood at the very end of the route cannot advance.
    const atEnd = locked(
      start,
      { kyiv: [null, null, null, null, null, null, null, 'wood'] },
      { remaining: 1, colors: ['wood'] },
    );
    expectError(() => moveTrack(atEnd, me, 'kyiv'), 'ILLEGAL_TRACK_MOVE');
    // A colour not yet on the route enters at space 1 (pg. 9) — but only if space 1 is empty. Here a green
    // tile already sits on space 1, so wood cannot enter.
    const occupiedStart = locked(
      start,
      { stpetersburg: ['green', null, null, null, null, null, null] },
      { remaining: 1, colors: ['wood'] },
    );
    expectError(() => moveTrack(occupiedStart, me, 'stpetersburg'), 'ILLEGAL_TRACK_MOVE');
  });

  it('is reachable through applyAction, which gates the lock both ways', () => {
    const start = newGame(2);
    const me = activeId(start);
    // MOVE_TRACK with no lock → refused.
    expectError(() => applyAction(start, me, { type: 'MOVE_TRACK', route: 'transsiberian' }), 'NO_PENDING_MOVES');
    // Place a track space, then a non-MOVE action is refused until the lock clears.
    const locked1 = applyAction(start, me, { type: 'PLACE', space: 'track-wood-1' });
    expectError(() => applyAction(locked1, me, { type: 'PASS' }), 'MOVES_PENDING');
    const moved = applyAction(locked1, me, { type: 'MOVE_TRACK', route: 'transsiberian', color: 'wood' });
    expect(moved.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
  });
});
