import { makeSeating } from '../../../kernel';
import { GameError } from '../core';
import type { GameState, PlayerState } from '../core';

// Seat helpers, shared from the kernel but bound to Container's own `GameError` subclass so a
// PLAYER_NOT_FOUND stays `instanceof` the class the backend's `mapError` branches on (see the kernel
// `makeSeating` note). Container has no `activePlayer` (it never needed one); `getPlayer` is its extra.
const { seatOf, withPlayer } = makeSeating<PlayerState>((playerId) => {
  throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
});

export { seatOf, withPlayer };

/** Read a player's state by id, or throw PLAYER_NOT_FOUND. Public. */
export function getPlayer(state: GameState, playerId: string): PlayerState {
  return state.players[seatOf(state, playerId)]!;
}
