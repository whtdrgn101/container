import { makeSeating } from '@game-hub/kernel';
import { GameError } from '../core';
import type { RussianRailroadsPlayer } from '../core';

// Seat helpers, shared from the kernel but bound to this game's own `GameError` subclass so a
// PLAYER_NOT_FOUND stays `instanceof` the class the backend's `mapError` branches on (see the kernel
// `makeSeating` note).
export const { seatOf, withPlayer, activePlayer } = makeSeating<RussianRailroadsPlayer>((playerId) => {
  throw new GameError('PLAYER_NOT_FOUND', `No player with id "${playerId}"`);
});
