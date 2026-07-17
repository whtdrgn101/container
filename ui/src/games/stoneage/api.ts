import type { Action, PlaceId, StoneAgeView } from '@game-hub/engine/stoneage';
import { applyAction, BASE_URL, getGame, JSON_HEADERS, unwrap } from '@/lib/api';
import type { GamePayload } from '@/lib/api';

/**
 * Stone Age's API client. Pins the platform's generic calls to Stone Age's view type. So far the only
 * action is `PLACE` (roadmap SA1); the dice-roll route arrives with the resource/hunt stages.
 */
export const GAME_TYPE = 'stoneage';

export type StoneAgePayload = GamePayload<StoneAgeView>;

/** Re-read a Stone Age game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<StoneAgePayload> =>
  getGame<StoneAgeView>(gameId, viewer);

/** Apply a Stone Age action, typed. */
export const act = (gameId: string, playerId: string, action: Action, viewer?: string): Promise<StoneAgePayload> =>
  applyAction<StoneAgeView>(gameId, playerId, action, viewer);

/**
 * Gather resources from a place (SA2). The **server** rolls one die per worker there and returns the
 * new state — the client asks to gather; it can't choose the dice.
 */
export async function gather(gameId: string, playerId: string, place: PlaceId, viewer?: string): Promise<StoneAgePayload> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap<StoneAgeView>(
    await fetch(`${BASE_URL}/games/${gameId}/stoneage/roll${query}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ playerId, place }),
    }),
  );
}
