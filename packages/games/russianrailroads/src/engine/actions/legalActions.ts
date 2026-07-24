import { ACTION_SPACES } from '../core';
import type { RussianRailroadsState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';

/**
 * The actions a seat may legally take right now (RR1): `PASS` (always, on your turn), plus a `PLACE` for
 * every **unoccupied** action space the seat can pay for (pg. 7). For each such space it enumerates the
 * distinct ways to pay the requirement — all workers, or all coins (pg. 14) — so the UI and (later) the
 * bot get exact, single placements rather than every combination.
 *
 * Reads only the active seat's own public counts (workers, coins), so it leaks nothing. Russian Railroads
 * has no off-turn moves in RR1, so a query for a non-active (or passed, or finished) seat answers empty.
 */
export function legalActions(state: RussianRailroadsState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];

  const seat = playerId === undefined ? state.activePlayerIndex : seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) return [];
  const player = state.players[seat]!;
  if (player.passed) return [];

  const actions: Action[] = [{ type: 'PASS' }];

  for (const space of ACTION_SPACES) {
    const occupied = !space.neverOccupies && (state.actionSpaces[space.id]?.length ?? 0) > 0;
    if (occupied) continue;
    // Pay all with workers…
    if (player.workersAvailable >= space.workers) actions.push({ type: 'PLACE', space: space.id });
    // …or all with coins (pg. 14). RR1's spaces need 1, so worker/coin are the only distinct ways.
    if (player.coins >= space.workers) actions.push({ type: 'PLACE', space: space.id, coins: space.workers });
  }

  return actions;
}
