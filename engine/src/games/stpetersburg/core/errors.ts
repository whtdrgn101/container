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
  // A BUY of a trading card — buying one needs displacement (pg. 7), which lands in SP4.
  | 'TRADING_NOT_BUYABLE';

/**
 * Thrown when a Saint Petersburg action is illegal. The shared kernel `GameError` carries the
 * code/message machinery; this subclass pins `code` to Saint Petersburg's own union (the same pattern
 * every game uses, and what keeps the backend's `mapError` `instanceof` check sound).
 */
export class GameError extends KernelGameError<StPetersburgErrorCode> {}
