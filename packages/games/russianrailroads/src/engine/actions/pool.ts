import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';
import { accessibleColors, continueTurn, legalSteps, record, seatOf, withPlayer } from '../internal';

/**
 * Resolve the per-turn **action pool** (pg. 7, 13) — the track-move credits a player earned this turn from
 * factories / the bottom industrialization space. The lock discipline is the binding rule: `RESOLVE_POOL`
 * pops one credit and opens the ordinary **pending-moves lock** for it, so the credit is spent one
 * `MOVE_TRACK` at a time (and `moveTrack` returns control to the pool when the lock clears — see
 * `nextSeatOrHold`). `SKIP_POOL` forfeits the rest (pg. 13: unused credits are lost). Never mutates; throws.
 */

/**
 * `RESOLVE_POOL` — spend the pool credit `id` by opening the pending-moves lock for its `count` step(s),
 * constrained to its colours ∩ the player's access. Removes the credit from the pool and keeps the turn.
 * Throws `UNKNOWN_POOL_ENTRY` (no such id) or `POOL_UNRESOLVABLE` (no accessible-colour track can advance —
 * `SKIP_POOL` it instead).
 */
export function resolvePool(state: RussianRailroadsState, playerId: string, id: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const entry = player.actionPool.find((e) => e.id === id);
  if (!entry) throw new GameError('UNKNOWN_POOL_ENTRY', `No pool credit "${id}"`);

  const access = accessibleColors(player);
  const colors = entry.colors.filter((c) => access.includes(c));
  if (legalSteps(player.routes, colors).length === 0) {
    throw new GameError('POOL_UNRESOLVABLE', `Pool credit "${id}" cannot advance any track — skip it instead`);
  }

  const actionPool = player.actionPool.filter((e) => e.id !== id);
  const updated = { ...player, actionPool };
  return record(
    state,
    'RESOLVE_POOL',
    playerId,
    { players: withPlayer(state, seat, updated), pendingMoves: { remaining: entry.count, colors } },
    { id, count: entry.count },
  );
}

/**
 * `SKIP_POOL` — forfeit every remaining pool credit (pg. 13: unused indirect actions are lost) and pass the
 * turn to the next un-passed seat. The only way to end a resolution with credits still unspent.
 */
export function skipPool(state: RussianRailroadsState, playerId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const forfeited = player.actionPool.length;
  const updated = { ...player, actionPool: [] };
  // With the pool emptied, `continueTurn` hands off (respecting the reuse / setup mini-phase context).
  const next = { ...state, players: withPlayer(state, seat, updated) };
  return record(state, 'SKIP_POOL', playerId, continueTurn(next, seat), { forfeited });
}
