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
  | 'LOCO_FLIP_NOT_ALLOWED'
  // A PLACE building a factory when none can be taken — the loco supply is empty and no factory has been
  // returned to it (pg. 12: "the lowest-numbered locomotive or any returned factory").
  | 'FACTORY_UNAVAILABLE'
  // A REPLACE_FACTORY / PLACE_FACTORY naming a returned factory number that isn't in the supply (pg. 12).
  | 'NO_SUCH_FACTORY'
  // A non-factory-resolution action attempted while a factory is owed (pg. 12–13): place the factory first.
  | 'FACTORY_PENDING'
  // A PLACE_FACTORY / REPLACE_FACTORY with no factory owed — nothing to resolve.
  | 'NO_PENDING_FACTORY'
  // A PLACE_FACTORY when all 5 gaps are already filled (must REPLACE), or a REPLACE_FACTORY before they are
  // (must PLACE into the leftmost gap), or a REPLACE_FACTORY naming a slot out of range (pg. 12).
  | 'ILLEGAL_FACTORY_PLACEMENT'
  // A non-pool action attempted while the active seat still has unresolved pool credits (pg. 7, 13).
  | 'POOL_PENDING'
  // A RESOLVE_POOL / SKIP_POOL with no pool credits to resolve.
  | 'NO_PENDING_POOL'
  // A RESOLVE_POOL naming a pool-entry id that isn't in the pool (pg. 13).
  | 'UNKNOWN_POOL_ENTRY'
  // A RESOLVE_POOL of a credit that can't be spent — no accessible-colour track can advance (pg. 13). Use
  // SKIP_POOL to forfeit it instead.
  | 'POOL_UNRESOLVABLE'
  // A claim on the turn-order space directly below your own pawn (pg. 16: "you cannot occupy the action
  // space below your own pawn").
  | 'TURN_ORDER_OWN_PAWN'
  // A second turn-order claim by a seat that already claimed one this round (pg. 16: "you cannot occupy
  // both action spaces").
  | 'TURN_ORDER_ALREADY_CLAIMED'
  // A RESOLVE_KEY with no key owed, or an unknown option (pg. 19).
  | 'NO_PENDING_KEY'
  | 'KEY_PENDING'
  // A RESOLVE_IDEA_TOKEN with no idea-token choice owed, or naming a token already used / not a real type
  // (pg. 18–19, 46).
  | 'NO_PENDING_IDEA_TOKEN'
  | 'IDEA_TOKEN_PENDING'
  | 'IDEA_TOKEN_UNAVAILABLE'
  // A RESOLVE_IDEA_CARD with no idea-card choice owed, or naming an unknown card (pg. 46–47).
  | 'NO_PENDING_IDEA_CARD'
  | 'IDEA_CARD_PENDING'
  | 'UNKNOWN_IDEA_CARD'
  // A RESOLVE_REUSE with no reuse mini-phase active, or targeting an illegal space (pg. 17: an empty
  // 1-worker space only).
  | 'NO_PENDING_REUSE'
  | 'REUSE_PENDING'
  | 'ILLEGAL_REUSE_SPACE'
  // A RESOLVE_SETUP_BONUS with no setup mini-phase active, or naming an unknown starting bonus card (pg. 6).
  | 'NO_PENDING_SETUP_BONUS'
  | 'SETUP_BONUS_PENDING'
  | 'UNKNOWN_SETUP_BONUS';

/**
 * Thrown when a Russian Railroads action is illegal. Subclasses the shared kernel `GameError` and pins
 * `code` to this game's own union — the same pattern every game uses, and what keeps the backend's
 * `mapError` `instanceof` check sound (see the kernel `makeSeating` note).
 */
export class GameError extends KernelGameError<RussianRailroadsErrorCode> {}
