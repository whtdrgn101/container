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
  // A BUY/PLAY_FROM_HAND of a **trading** card with no displacement target — a trading card must displace
  // an already-placed card of the same colour (pg. 7).
  | 'DISPLACE_REQUIRED'
  // A displacement target on a **non-trading** card — only trading cards displace (pg. 7).
  | 'DISPLACE_NOT_ALLOWED'
  // A displacement target that isn't a legal card to displace: a stale/wrong id, a card of the wrong
  // colour, another trading card, or a green ware-symbol mismatch (pg. 7–8).
  | 'INVALID_DISPLACE_TARGET'
  // An ADD_TO_HAND when the hand is already at its limit (pg. 3: at most 3 cards; Warehouse 4, SP5).
  | 'HAND_FULL'
  // ── SP5 special cards (pg. 8) ──
  // A non-PUB_BUY move while a Pub buy-points interlude is pending, or a non-OBSERVATORY_RESOLVE move
  // while an Observatory draw is pending — the seat's turn is locked to resolve it first.
  | 'PUB_PENDING'
  | 'DRAW_PENDING'
  // A PUB_BUY / OBSERVATORY_RESOLVE sent when no such interlude is pending.
  | 'NO_PUB_PENDING'
  | 'NO_DRAW_PENDING'
  // A PUB_BUY for more than the 5-point maximum, or a negative/non-integer point count (pg. 8).
  | 'INVALID_PUB_POINTS'
  // An OBSERVATORY_DRAW when the seat can't: not the building phase, or it owns no unflipped Observatory.
  | 'OBSERVATORY_UNAVAILABLE'
  // An OBSERVATORY_DRAW naming a stack with ≤1 card ("it may not be the last card in the stack", pg. 8).
  | 'STACK_TOO_SMALL'
  // An OBSERVATORY_RESOLVE with an unrecognised choice (not buy / hand / discard).
  | 'INVALID_RESOLVE_CHOICE';

/**
 * Thrown when a Saint Petersburg action is illegal. The shared kernel `GameError` carries the
 * code/message machinery; this subclass pins `code` to Saint Petersburg's own union (the same pattern
 * every game uses, and what keeps the backend's `mapError` `instanceof` check sound).
 */
export class GameError extends KernelGameError<StPetersburgErrorCode> {}
