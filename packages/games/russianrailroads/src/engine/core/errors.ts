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
  | 'INSUFFICIENT_WORKERS'
  // A non-MOVE_TRACK action attempted while a track-extension lock is set (pg. 8–9): you must finish
  // resolving your track moves first.
  | 'MOVES_PENDING'
  // A MOVE_TRACK with no pending lock — nothing to resolve.
  | 'NO_PENDING_MOVES'
  // A MOVE_TRACK naming a route that isn't one of the player's three (pg. 8).
  | 'UNKNOWN_ROUTE'
  // A MOVE_TRACK whose colour isn't allowed by the lock's constraint (pg. 9 build order / colour access).
  | 'INVALID_TRACK_COLOR'
  // A MOVE_TRACK that can't be made: no such colour track on the route, the space ahead is occupied
  // (no leapfrog), or the track is at the route's end (pg. 9).
  | 'ILLEGAL_TRACK_MOVE'
  // A PLACE on the doubler space when no doubler tile can be taken — the shared supply is empty or every
  // Trans-Siberian doubler space is filled (pg. 14).
  | 'DOUBLER_UNAVAILABLE'
  // A PLACE on a locomotive action space when the locomotive supply is exhausted (pg. 10, 12).
  | 'LOCO_SUPPLY_EMPTY'
  // A non-loco-resolution action attempted while a locomotive is held (pg. 10–11): finish placing it first.
  | 'LOCO_PENDING'
  // A PLACE_LOCO / REPLACE_LOCO / FLIP_LOCO with no locomotive held — nothing to resolve.
  | 'NO_PENDING_LOCO'
  // A PLACE_LOCO onto a route with no empty locomotive slot (pg. 10 capacity: Trans-Sib 2, others 1).
  | 'ILLEGAL_LOCO_PLACEMENT'
  // A REPLACE_LOCO whose target isn't on the route or isn't strictly lower-numbered (pg. 10 upgrade rule).
  | 'ILLEGAL_LOCO_UPGRADE'
  // A FLIP_LOCO while the player still has an empty locomotive slot somewhere (pg. 11 constraint).
  | 'LOCO_FLIP_NOT_ALLOWED';

/**
 * Thrown when a Russian Railroads action is illegal. Subclasses the shared kernel `GameError` and pins
 * `code` to this game's own union — the same pattern every game uses, and what keeps the backend's
 * `mapError` `instanceof` check sound (see the kernel `makeSeating` note).
 */
export class GameError extends KernelGameError<RussianRailroadsErrorCode> {}
