import { GameError as KernelGameError } from '@game-hub/kernel';

/** Machine-readable reasons a Can't Stop action can be rejected. The backend maps these to HTTP 4xx. */
export type CantStopErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  // The action doesn't fit the current phase: rolling vs. choosing a pairing for the dice you rolled.
  | 'WRONG_PHASE'
  // The dice payload isn't four faces of 1–6 (the roll route builds these; the engine still checks).
  | 'INVALID_ROLL'
  // The chosen pairing isn't one of the legal advancements for the current dice + markers.
  | 'INVALID_SELECTION'
  // Stopping requires having advanced at least one runner this turn — you can't bank nothing.
  | 'NOTHING_TO_STOP';

/**
 * Thrown when a Can't Stop action is illegal. The shared kernel `GameError` carries the
 * `code`/`message` machinery; this subclass pins `code` to Can't Stop's own union so a thrown code is
 * always one the game declares (the same pattern Container uses).
 */
export class GameError extends KernelGameError<CantStopErrorCode> {}
