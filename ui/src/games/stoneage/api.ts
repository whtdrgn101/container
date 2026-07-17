import type { StoneAgeView } from '@game-hub/engine/stoneage';
import { getGame } from '@/lib/api';
import type { GamePayload } from '@/lib/api';

/**
 * Stone Age's API client. The scaffold (roadmap SA0) has no actions of its own yet, so this only pins
 * the platform's generic `getGame` to Stone Age's view type; the per-action endpoints (and the dice
 * roll route) arrive with their stages.
 */
export const GAME_TYPE = 'stoneage';

export type StoneAgePayload = GamePayload<StoneAgeView>;

/** Re-read a Stone Age game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<StoneAgePayload> =>
  getGame<StoneAgeView>(gameId, viewer);
