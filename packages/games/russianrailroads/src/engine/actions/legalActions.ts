import { ACTION_SPACES } from '../core';
import type { RussianRailroadsState } from '../core';
import { accessibleColors, legalSteps, seatOf } from '../internal';
import type { Action } from './action';

/**
 * The actions a seat may legally take right now (RR2). Reads only the active seat's own public board, so it
 * leaks nothing. Russian Railroads has no off-turn moves, so a query for a non-active (or passed, or
 * finished) seat answers empty.
 *
 *  - **While a track-extension lock is set** (pg. 8–9): only the legal single `MOVE_TRACK` steps — one per
 *    (route, allowed colour) whose track can advance. No `PLACE`/`PASS` until the lock clears. This is the
 *    exact, small enumeration the pending-lock design buys instead of every N-step distribution.
 *  - **Otherwise**: `PASS`, plus a `PLACE` for every unoccupied space the seat can pay for (pg. 7). For a
 *    track space it enumerates a placement only if it would yield at least one legal step (else it would
 *    auto-forfeit); the mandatory worker+coin space has no coin-substitution variant, every other space
 *    offers pay-all-workers and pay-with-coins (pg. 14).
 */
export function legalActions(state: RussianRailroadsState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];

  const seat = playerId === undefined ? state.activePlayerIndex : seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) return [];
  const player = state.players[seat]!;
  if (player.passed) return [];

  if (state.pendingMoves) {
    return legalSteps(player.routes, state.pendingMoves.colors).map((step) => ({
      type: 'MOVE_TRACK',
      route: step.route,
      color: step.color,
    }));
  }

  const actions: Action[] = [{ type: 'PASS' }];
  const access = accessibleColors(player);

  for (const space of ACTION_SPACES) {
    const occupied = !space.neverOccupies && (state.actionSpaces[space.id]?.length ?? 0) > 0;
    if (occupied) continue;
    // A track space is only worth offering if some accessible-colour track can actually advance (else the
    // placement would immediately forfeit its moves).
    if (space.track) {
      const colors = space.track.colors.filter((c) => access.includes(c));
      if (legalSteps(player.routes, colors).length === 0) continue;
    }

    const coinCost = space.coinCost ?? 0;
    if (coinCost > 0) {
      // Worker+coin space (pg. 9): exactly its workers + its coin, no substitution.
      if (player.workersAvailable >= space.workers && player.coins >= coinCost) {
        actions.push({ type: 'PLACE', space: space.id });
      }
      continue;
    }
    // Pay all with workers…
    if (player.workersAvailable >= space.workers) actions.push({ type: 'PLACE', space: space.id });
    // …or all with coins (pg. 14).
    if (player.coins >= space.workers) actions.push({ type: 'PLACE', space: space.id, coins: space.workers });
  }

  return actions;
}
