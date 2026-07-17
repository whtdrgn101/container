import { GameError as KernelGameError } from '../../../kernel';

/** Machine-readable reasons a Stone Age action can be rejected. The backend maps these to HTTP 4xx. */
export type StoneAgeErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  // The scaffold accepts no moves yet — each action arrives in its own roadmap stage.
  | 'NOT_IMPLEMENTED';

/**
 * Thrown when a Stone Age action is illegal. The shared kernel `GameError` carries the code/message
 * machinery; this subclass pins `code` to Stone Age's own union (the same pattern the other games use).
 */
export class GameError extends KernelGameError<StoneAgeErrorCode> {}
