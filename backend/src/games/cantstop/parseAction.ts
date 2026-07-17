import type { Action } from '@container/engine/cantstop';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Can't Stop `Action`.
 *
 * Only the player's real choices — `SELECT` and `STOP` — are accepted. `ROLL` is **server-only**: the
 * dice are rolled with injected randomness by `POST /games/:id/cantstop/roll`, so a client that posts
 * its own `ROLL` (with dice of its choosing) is refused here rather than allowed to cheat. As with
 * Container, this checks *structure* only; the engine judges legality and answers with a `GameError`.
 */
export function parseCantStopAction(raw: unknown): ParseResult<Action> {
  if (!isRecord(raw)) return bad('An action must be an object');

  switch (raw['type']) {
    case 'SELECT': {
      const columns = raw['columns'];
      if (!Array.isArray(columns) || columns.some((col) => typeof col !== 'number')) {
        return bad('SELECT requires a `columns` array of numbers');
      }
      return ok({ type: 'SELECT', columns: columns as number[] });
    }
    case 'STOP':
      return ok({ type: 'STOP' });
    case 'ROLL':
      return bad('ROLL is server-only — use POST /games/:id/cantstop/roll');
    default:
      return bad(`Unknown action type "${String(raw['type'])}"`);
  }
}

const ok = (action: Action): ParseResult<Action> => ({ ok: true, action });
const bad = (message: string): ParseResult<Action> => ({ ok: false, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
