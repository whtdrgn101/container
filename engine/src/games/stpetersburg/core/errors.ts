import { GameError as KernelGameError } from '../../../kernel';

/** Machine-readable reasons a Saint Petersburg action can be rejected. The backend maps these to HTTP 4xx. */
export type StPetersburgErrorCode =
  | 'INVALID_PLAYER_COUNT'
  | 'PLAYER_NOT_FOUND'
  | 'NOT_YOUR_TURN'
  | 'GAME_OVER'
  // A BUY the active seat can't afford after cost reductions (pg. 6).
  | 'INSUFFICIENT_RUBLES'
  // A BUY naming an empty/out-of-range card slot in a row.
  | 'INVALID_CARD_SLOT'
  // A BUY of a trading card, or a PLAY_FROM_HAND of one — both need displacement (pg. 7), which lands in SP4.
  | 'TRADING_NOT_BUYABLE'
  // An ADD_TO_HAND when the hand is already at its limit (pg. 3: at most 3 cards; Warehouse 4 at SP5).
  | 'HAND_FULL';

/**
 * Thrown when a Saint Petersburg action is illegal. The shared kernel `GameError` carries the
 * code/message machinery; this subclass pins `code` to Saint Petersburg's own union (the same pattern
 * every game uses, and what keeps the backend's `mapError` `instanceof` check sound).
 */
export class GameError extends KernelGameError<StPetersburgErrorCode> {}
