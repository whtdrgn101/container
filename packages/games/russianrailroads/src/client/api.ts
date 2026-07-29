import type { Action, RussianRailroadsView } from '../engine';
import { applyAction, getGame } from '@game-hub/ui-kit';
import type { GamePayload } from '@game-hub/kernel/client';

/**
 * Russian Railroads' own API client. RR1 has **no server-only actions** (base-game randomness is
 * setup-only), so every move (`PLACE` / `PASS`) goes over the generic `/actions` route. This just pins the
 * platform client's `unknown` state back to the game's view type (`unknown` at the seam, never inside the
 * board).
 */

/** The game type id this client speaks. Matches the backend module's `id`. */
export const GAME_TYPE = 'russianrailroads';

/** A Russian Railroads game payload, with its state pinned to the game's view. */
export type RussianRailroadsPayload = GamePayload<RussianRailroadsView>;

/** Apply a Russian Railroads action, typed. `expectedVersion` threads optimistic concurrency. */
export const act = (
  gameId: string,
  playerId: string,
  action: Action,
  viewer?: string,
  expectedVersion?: number,
): Promise<RussianRailroadsPayload> =>
  applyAction<RussianRailroadsView>(gameId, playerId, action, viewer, expectedVersion);

/** Re-read a Russian Railroads game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<RussianRailroadsPayload> =>
  getGame<RussianRailroadsView>(gameId, viewer);
