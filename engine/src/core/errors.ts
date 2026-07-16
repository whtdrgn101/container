/** Machine-readable reasons an action can be rejected. The backend maps these to HTTP 4xx codes. */
export type GameErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'NO_ACTIONS_REMAINING'
  | 'NO_FACTORIES'
  | 'INSUFFICIENT_FUNDS'
  | 'STORAGE_LIMIT_EXCEEDED'
  | 'INVALID_SELECTION'
  | 'INVALID_LOT_PRICE'
  | 'FACTORY_LIMIT_REACHED'
  | 'WAREHOUSE_LIMIT_REACHED'
  | 'DUPLICATE_FACTORY_COLOR'
  | 'OUT_OF_SUPPLY'
  | 'CANNOT_ENTER_OWN_HARBOR'
  | 'INVALID_DESTINATION'
  | 'NOT_AN_OPPONENT'
  | 'SHIP_NOT_DOCKED'
  | 'SHIP_CAPACITY_EXCEEDED'
  | 'MUST_DELIVER'
  | 'INVALID_DELIVERY'
  // A runoff ended still tied, so the deliverer must pick the winner (pg. 16).
  | 'CHOICE_REQUIRED'
  | 'LOAN_LIMIT_REACHED'
  | 'NO_LOANS_TO_REPAY'
  | 'NO_AUCTION_TOKEN'
  | 'AUCTION_TYPE_LIMIT'
  | 'INVALID_BANK_LOT'
  | 'BID_TOO_LOW'
  | 'SHIP_NOT_AT_BANK'
  | 'NOTHING_IN_HOLDING'
  | 'GAME_OVER';

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
