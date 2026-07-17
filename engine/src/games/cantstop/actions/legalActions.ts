import type { CantStopState } from '../core';
import { legalSelections } from '../internal';
import type { Action } from './action';

/**
 * The actions the given seat may legally take right now — drives the UI's affordances and any bot.
 *
 * `ROLL` is never listed: it's server-only (the roll route owns it), so a client that wants to roll
 * calls that route, not `/actions`. In the `selecting` phase this returns one `SELECT` per legal
 * pairing; in the `rolling` phase it offers `STOP` once at least one runner is out. Off-turn seats
 * have nothing to do. `playerId` defaults to the active player.
 */
export function legalActions(state: CantStopState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];
  const active = state.players[state.activePlayerIndex]!;
  if (playerId !== undefined && playerId !== active.id) return [];

  if (state.phase === 'selecting') {
    return legalSelections(state).map((columns) => ({ type: 'SELECT', columns }));
  }
  return Object.keys(state.runners).length > 0 ? [{ type: 'STOP' }] : [];
}
