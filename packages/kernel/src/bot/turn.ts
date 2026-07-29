import { BotError } from './errors.js';

/**
 * The slice of a game view `assertBotTurn` reads. Every game's `GameView` satisfies it structurally,
 * so the kernel stays ignorant of what any game is — the same discipline the engine kernel keeps.
 */
export interface SeatedView<P extends { readonly id: string }> {
  readonly id: string;
  readonly status: string;
  readonly activePlayerIndex: number;
  readonly players: readonly P[];
}

/**
 * The guard every game's `decide` opens with: refuse a finished game, and refuse to act out of turn.
 *
 * These two checks were byte-identical in all three games' `decide.ts`. They are a *bot* concern, not
 * a rules one — a `BotError` means the caller drove the bot wrong (wrong seat, finished game), never an
 * illegal move (those stay `GameError`s). Returns the active player so a caller that needs it (Stone
 * Age reads the seat's resources straight off it) doesn't re-index.
 */
export function assertBotTurn<P extends { readonly id: string }>(view: SeatedView<P>, playerId: string): P {
  if (view.status === 'ended') {
    throw new BotError(`Game "${view.id}" has ended — there is nothing to decide`);
  }
  const active = view.players[view.activePlayerIndex];
  if (!active || active.id !== playerId) {
    throw new BotError(`It is not bot seat "${playerId}"'s turn (active seat is "${active?.id ?? 'none'}")`);
  }
  return active;
}
