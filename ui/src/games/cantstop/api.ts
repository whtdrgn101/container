import type { Action, CantStopView } from '@game-hub/engine/cantstop';
import { BASE_URL, JSON_HEADERS, applyAction, getGame, unwrap } from '@/lib/api';
import type { GamePayload } from '@/lib/api';

/**
 * Can't Stop's own API client — the endpoints only this game has.
 *
 * The platform client (`lib/api.ts`) owns `/games`, `/games/:id`, `/actions` and the stream; a game's
 * own routes live under `/games/:id/<gameType>/…` (roadmap C1). Can't Stop's only extra endpoint is the
 * dice roll, which is a *server* action (the dice must be rolled with server randomness), so it lives
 * here rather than as an opaque `/actions` move.
 *
 * This file is also where Can't Stop's **types** re-enter: `lib/api.ts` hands out `unknown` states, and
 * these wrappers pin them back to `CantStopView` so the board is fully typed. `unknown` at the seam,
 * never inside a board.
 */

/** The game type id this client speaks. Matches the backend module's `id`. */
export const GAME_TYPE = 'cantstop';

/** A Can't Stop game payload, with its state pinned to Can't Stop's view. */
export type CantStopPayload = GamePayload<CantStopView>;

const route = (gameId: string, path: string) => `${BASE_URL}/games/${gameId}/${GAME_TYPE}${path}`;

/**
 * Apply a Can't Stop action (SELECT / STOP), typed. Thin wrapper over the opaque-action route.
 * `expectedVersion` threads optimistic concurrency (REVIEW §4.2).
 */
export const act = (
  gameId: string,
  playerId: string,
  action: Action,
  viewer?: string,
  expectedVersion?: number,
): Promise<CantStopPayload> => applyAction<CantStopView>(gameId, playerId, action, viewer, expectedVersion);

/** Re-read a Can't Stop game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<CantStopPayload> =>
  getGame<CantStopView>(gameId, viewer);

/**
 * Roll the four dice. The **server** rolls them (from its injected randomness) and returns the new
 * state — the client only asks to roll, so it can never choose its own dice. Whether the roll busts or
 * opens a pairing choice comes back in the state's `phase`.
 */
export async function roll(gameId: string, playerId: string, viewer?: string): Promise<CantStopPayload> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap<CantStopView>(
    await fetch(route(gameId, `/roll${query}`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ playerId }),
    }),
  );
}
