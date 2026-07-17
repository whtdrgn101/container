import type { Action, StoneAgeView } from '@game-hub/engine/stoneage';
import { applyAction, getGame } from '@/lib/api';
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
