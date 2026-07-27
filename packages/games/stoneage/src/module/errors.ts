import { GameError } from '../engine';
import type { ErrorResponse } from '@game-hub/kernel';

/**
 * Map Stone Age's domain errors onto HTTP — the same shape the other games use:
 *   404 — the thing you named doesn't exist (an unknown player)
 *   400 — the request could never be valid (a bad player count)
 *   409 — a legal-looking move this state refuses (wrong turn, not-yet-implemented, game over, …)
 */
export function mapStoneAgeError(error: unknown): ErrorResponse | null {
  if (!(error instanceof GameError)) return null;
  const status = error.code === 'PLAYER_NOT_FOUND' ? 404 : error.code === 'INVALID_PLAYER_COUNT' ? 400 : 409;
  return { status, code: error.code, message: error.message };
}
