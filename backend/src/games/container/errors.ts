import { GameError } from '@container/engine/container';
import type { ErrorResponse } from '../module';

/**
 * Map Container's domain errors onto HTTP.
 *
 * This used to be baked into the shared `app.ts`, which meant the API knew one game's error codes by
 * name — every new game would have had to re-teach it. Now each module owns its own mapping and the
 * core just sends whatever comes back (or 500s on `null`, for an error nobody claims).
 *
 * The shape of the mapping is the same for any turn-based game, and is worth keeping to:
 *   404 — the thing you named doesn't exist
 *   400 — the request could never be valid
 *   409 — a legal-looking move that this state refuses (wrong turn, no actions left, bad build, …)
 */
export function mapContainerError(error: unknown): ErrorResponse | null {
  if (!(error instanceof GameError)) return null;
  const status =
    error.code === 'PLAYER_NOT_FOUND' ? 404 : error.code === 'INVALID_PLAYER_COUNT' ? 400 : 409;
  return { status, code: error.code, message: error.message };
}
