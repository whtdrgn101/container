import { GameError as KernelGameError } from '@game-hub/kernel';

/**
 * Machine-readable reasons a Russian Railroads action can be rejected. The backend maps these to HTTP 4xx.
 * The surface grows one slice at a time (RR1 ships the worker-placement spine).
 */
export type RussianRailroadsErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  // A PLACE naming an action space that doesn't exist on the board.
  | 'UNKNOWN_SPACE'
  // A PLACE on an already-occupied space — a space with any worker OR coin on it (pg. 7). The one
  // never-occupied space (the bottom track-extension space, pg. 9) is exempt.
  | 'SPACE_OCCUPIED'
  // A PLACE the seat can't pay for: not enough workers, not enough coins to substitute, or more coins
  // than the space requires (pg. 7, 14).
  | 'INSUFFICIENT_WORKERS';

/**
 * Thrown when a Russian Railroads action is illegal. Subclasses the shared kernel `GameError` and pins
 * `code` to this game's own union — the same pattern every game uses, and what keeps the backend's
 * `mapError` `instanceof` check sound (see the kernel `makeSeating` note).
 */
export class GameError extends KernelGameError<RussianRailroadsErrorCode> {}
