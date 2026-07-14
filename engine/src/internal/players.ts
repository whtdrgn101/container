import { GameError } from '../core';
import type { GameState, PlayerState } from '../core';

/** Locate a player's seat index, or throw PLAYER_NOT_FOUND. Internal. */
export function seatOf(state: GameState, playerId: string): number {
  const index = state.players.findIndex((player) => player.id === playerId);
  if (index === -1) {
    throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
  }
  return index;
}

/** Read a player's state by id, or throw PLAYER_NOT_FOUND. Public. */
export function getPlayer(state: GameState, playerId: string): PlayerState {
  return state.players[seatOf(state, playerId)]!;
}

/** Replace one player in the roster, returning a new player array. Internal. */
export function withPlayer(state: GameState, seat: number, player: PlayerState): readonly PlayerState[] {
  return state.players.map((current, index) => (index === seat ? player : current));
}
