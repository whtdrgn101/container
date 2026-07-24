import { GameError, ROUTES } from '../core';
import type { RouteId, RussianRailroadsState, TrackColor } from '../core';
import { advanceTrack, canAdvance, continueTurn, legalSteps, record, seatOf, withPlayer } from '../internal';

/**
 * Resolve one single step of a track-extension lock (pg. 9) — the `MOVE_TRACK` action. Consumes one of the
 * pending moves: advance one colour's track one space forward on a chosen route. The lock's presence and
 * the turn checks are in `applyAction`; this owns the step rules:
 *
 *  - the route must be one of the player's three (`UNKNOWN_ROUTE`);
 *  - the colour must be one the lock allows (`INVALID_TRACK_COLOR`) — RR2's lock is always `['wood']`, so
 *    an omitted colour defaults to it; the field exists for RR3's colour choice;
 *  - the track must be able to advance — it exists, the space ahead is empty, and it isn't at the route end
 *    (`ILLEGAL_TRACK_MOVE`, pg. 9: onto empty spaces only, no leapfrog, route-end stop).
 *
 * After the step, if moves remain **and** at least one legal step is still possible, the lock stays and the
 * placer keeps the turn; otherwise the lock clears (all moves spent, or none left possible — moves forfeit,
 * pg. 9 "as many as you are able to") and the turn passes to the next un-passed seat. Never mutates; throws.
 */
export function moveTrack(
  state: RussianRailroadsState,
  playerId: string,
  routeId: RouteId,
  color?: TrackColor,
): RussianRailroadsState {
  const lock = state.pendingMoves!; // guaranteed set by applyAction's pending gate

  if (!ROUTES.some((r) => r.id === routeId)) {
    throw new GameError('UNKNOWN_ROUTE', `No route "${routeId}"`);
  }
  // Default the colour when the lock allows exactly one (RR2 always does); otherwise it must be given.
  const chosen = color ?? (lock.colors.length === 1 ? lock.colors[0]! : undefined);
  if (chosen === undefined || !lock.colors.includes(chosen)) {
    throw new GameError('INVALID_TRACK_COLOR', `Colour "${String(color)}" is not allowed by this action`);
  }

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const route = player.routes.find((r) => r.id === routeId)!; // route id validated above
  if (!canAdvance(route, chosen)) {
    throw new GameError('ILLEGAL_TRACK_MOVE', `The ${chosen} track on "${routeId}" cannot advance`);
  }

  const routes = player.routes.map((r) => (r.id === routeId ? advanceTrack(r, chosen) : r));
  const updated = { ...player, routes };
  const players = withPlayer(state, seat, updated);
  const remaining = lock.remaining - 1;

  // Lock survives only if there is still something to spend it on (pg. 9).
  if (remaining > 0 && legalSteps(routes, lock.colors).length > 0) {
    return record(
      state,
      'MOVE_TRACK',
      playerId,
      { players, pendingMoves: { remaining, colors: lock.colors } },
      { route: routeId, color: chosen, remaining },
    );
  }
  // The lock is spent. `continueTurn` settles any newly-reached specials (a track step can reach a key /
  // idea-token / new-worker space, pp. 18–19), holds for remaining pool credits, or advances the context
  // (reuse / setup mini-phase, or the next seat).
  const next = { ...state, players };
  return record(
    state,
    'MOVE_TRACK',
    playerId,
    { pendingMoves: null, ...continueTurn(next, seat) },
    { route: routeId, color: chosen, remaining: 0, done: true },
  );
}
