import type { GameView } from '@container/engine/container';
import type { Ctx } from './types';
import { selfOf } from './valuation';

/**
 * Build a policy context for one seat from its own view.
 *
 * Public because callers outside `decide` need it too — the backend's `BotRunner` asks `wantsBuyout`
 * and `chooseTiedWinner` directly when a bot has to settle a delivery auction that the *server*
 * (not the bot) collected the bids for. Exporting this beats having those callers assemble a `Ctx`
 * by hand and quietly skip `selfOf`'s check that the view really belongs to the seat.
 */
export function contextFor(view: GameView, playerId: string): Ctx {
  return {
    view,
    me: selfOf(view, playerId),
    opponents: view.players.filter((player) => player.id !== playerId),
  };
}
