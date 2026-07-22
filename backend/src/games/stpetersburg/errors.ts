import { GameError } from '@game-hub/engine/stpetersburg';
import type { ErrorResponse } from '../module';

/**
 * Map Saint Petersburg's domain errors onto HTTP — the same shape the other three games use:
 *   404 — the thing you named doesn't exist (an unknown player)
 *   400 — the request could never be valid (a bad player count)
 *   409 — a legal-looking move this state refuses (wrong turn, not-implemented, game over)
 *
 * Checks `instanceof` the game's own `GameError` subclass (not the kernel base) so a base-class error
 * from elsewhere falls through to a 500 rather than being mislabelled a 404 (REVIEW §3.2).
 */
export function mapStPetersburgError(error: unknown): ErrorResponse | null {
  if (!(error instanceof GameError)) return null;
  const status =
    error.code === 'PLAYER_NOT_FOUND' ? 404 : error.code === 'INVALID_PLAYER_COUNT' ? 400 : 409;
  return { status, code: error.code, message: error.message };
}
