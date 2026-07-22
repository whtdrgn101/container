import type { Action, StPetersburgView } from '@game-hub/engine/stpetersburg';
import { applyAction, getGame } from '@/lib/api';
import type { GamePayload } from '@/lib/api';

/**
 * Saint Petersburg's own API client. Saint Petersburg has **no server-only actions** — even the SP5
 * Observatory draw is a *pure engine action* (the stack top is deterministic, shuffled once at setup), so
 * every move (BUY / PASS / ADD_TO_HAND / PLAY_FROM_HAND / PUB_BUY / OBSERVATORY_DRAW / OBSERVATORY_RESOLVE)
 * goes over the generic `/actions` route. This just pins the platform client's `unknown` state back to the
 * game's view type (`unknown` at the seam, never inside a board).
 */

/** The game type id this client speaks. Matches the backend module's `id`. */
export const GAME_TYPE = 'stpetersburg';

/** A Saint Petersburg game payload, with its state pinned to the game's view. */
export type StPetersburgPayload = GamePayload<StPetersburgView>;

/** Apply a Saint Petersburg action, typed. Thin wrapper over the opaque-action route. */
export const act = (gameId: string, playerId: string, action: Action, viewer?: string): Promise<StPetersburgPayload> =>
  applyAction<StPetersburgView>(gameId, playerId, action, viewer);

/** Re-read a Saint Petersburg game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<StPetersburgPayload> =>
  getGame<StPetersburgView>(gameId, viewer);
