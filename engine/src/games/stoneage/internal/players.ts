import { makeSeating } from '../../../kernel';
import { GameError } from '../core';
import type { StoneAgePlayer } from '../core';

// Seat helpers, shared from the kernel but bound to Stone Age's own `GameError` subclass so a
// PLAYER_NOT_FOUND stays `instanceof` the class the backend's `mapError` branches on (see the kernel
// `makeSeating` note).
export const { seatOf, withPlayer, activePlayer } = makeSeating<StoneAgePlayer>((playerId) => {
  throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
});
