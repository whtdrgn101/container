import { GameError } from '@game-hub/engine/cantstop';
import type { ErrorResponse } from '../module';

/**
 * Map Can't Stop's domain errors onto HTTP — the same shape Container uses:
 *   404 — the thing you named doesn't exist (an unknown player)
 *   400 — the request could never be valid (a bad player count)
 *   409 — a legal-looking move this state refuses (wrong turn/phase, an illegal pairing, …)
 */
export function mapCantStopError(error: unknown): ErrorResponse | null {
  if (!(error instanceof GameError)) return null;
  const status = error.code === 'PLAYER_NOT_FOUND' ? 404 : error.code === 'INVALID_PLAYER_COUNT' ? 400 : 409;
  return { status, code: error.code, message: error.message };
}
