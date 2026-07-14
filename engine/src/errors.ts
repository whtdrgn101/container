/** Machine-readable reasons an action can be rejected. The backend maps these to HTTP 4xx codes. */
export type GameErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NO_FACTORIES'
  | 'INSUFFICIENT_FUNDS'
  | 'STORAGE_LIMIT_EXCEEDED'
  | 'INVALID_SELECTION';

/**
 * Thrown when an action is illegal given the current state. Carries a stable `code`
 * so callers (and the API layer) can branch on the reason without string-matching.
 */
export class GameError extends Error {
  readonly code: GameErrorCode;

  constructor(code: GameErrorCode, message: string) {
    super(message);
    this.name = 'GameError';
    this.code = code;
  }
}
