import { GameError as KernelGameError } from '../../../kernel';

/** Machine-readable reasons a Stone Age action can be rejected. The backend maps these to HTTP 4xx. */
export type StoneAgeErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  // The action doesn't fit the current phase (placement vs. actions vs. feeding).
  | 'WRONG_PHASE'
  // An illegal worker placement: a full/re-used place, the wrong count, or too few people (SA1).
  | 'INVALID_PLACEMENT'
  // An illegal resource gather: no people on that place, or the wrong dice (SA2).
  | 'INVALID_GATHER'
  // An illegal use of a non-dice place — tool maker / hut / field (SA4–6).
  | 'INVALID_USE'
  // An illegal building purchase: no person on that slot, an empty stack, or a payment that doesn't
  // satisfy the tile's cost / that the player can't afford (SA9).
  | 'INVALID_BUILD'
  // An illegal take of a rolled gather: no pending roll, or a bad/already-used tool selection (SA4b).
  | 'INVALID_TAKE'
  // Another move was attempted while a rolled gather is waiting to be taken (SA4b).
  | 'GATHER_PENDING';

/**
 * Thrown when a Stone Age action is illegal. The shared kernel `GameError` carries the code/message
 * machinery; this subclass pins `code` to Stone Age's own union (the same pattern the other games use).
 */
export class GameError extends KernelGameError<StoneAgeErrorCode> {}
