import { GameError } from '../core';
import type { CantStopPlayer, CantStopState } from '../core';

/** Locate a player's seat index, or throw PLAYER_NOT_FOUND. Internal. */
export function seatOf(state: CantStopState, playerId: string): number {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
  }
  return index;
}

/** The seat whose turn it is. */
export function activePlayer(state: CantStopState): CantStopPlayer {
  return state.players[state.activePlayerIndex]!;
}

/** Replace one player in the roster, returning a new player array. Internal. */
export function withPlayer(
  state: CantStopState,
  seat: number,
  player: CantStopPlayer,
): readonly CantStopPlayer[] {
  return state.players.map((current, index) => (index === seat ? player : current));
}
