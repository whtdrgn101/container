import type { Action } from '@game-hub/engine/stpetersburg';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Saint Petersburg `Action` (roadmap SP1).
 *
 * Accepts the two client-sendable moves: `PASS`, and `BUY { row: 'upper'|'lower', index }`. Nothing here
 * is server-only yet (there is no dice roll / server-side draw until the Observatory in SP5), so every
 * action a client may take is validated here. `ADD_TO_HAND` / `PLAY_FROM_HAND` arrive with SP3.
 */
export function parseStPetersburgAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'action must be an object' };
  }
  const action = raw as { type?: unknown; row?: unknown; index?: unknown };

  if (action.type === 'PASS') {
    return { ok: true, action: { type: 'PASS' } };
  }

  if (action.type === 'BUY') {
    if (action.row !== 'upper' && action.row !== 'lower') {
      return { ok: false, message: 'BUY.row must be "upper" or "lower"' };
    }
    if (typeof action.index !== 'number' || !Number.isInteger(action.index) || action.index < 0) {
      return { ok: false, message: 'BUY.index must be a non-negative integer' };
    }
    return { ok: true, action: { type: 'BUY', row: action.row, index: action.index } };
  }

  return { ok: false, message: `unknown action type: ${String(action.type)}` };
}
