/**
 * Thrown when a bot is asked for a decision it cannot make. These are *programming* errors in the
 * caller (wrong view passed, bids not collected), never illegal-move rejections — those stay
 * `GameError`s from the engine.
 */
export class BotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BotError';
  }
}
