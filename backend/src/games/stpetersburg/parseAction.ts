import type { Action } from '@game-hub/engine/stpetersburg';
import type { ParseResult } from '../module';

/** A non-negative integer index into a row or a hand. */
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Is `value` a valid board row name? */
function isRow(value: unknown): value is 'upper' | 'lower' {
  return value === 'upper' || value === 'lower';
}

/**
 * Validate opaque JSON into a typed Saint Petersburg `Action` (roadmap SP1 + SP3).
 *
 * Accepts every client-sendable move: `PASS`; `BUY { row, index }`; `ADD_TO_HAND { row, index }`; and
 * `PLAY_FROM_HAND { index }`. Nothing here is server-only yet (there is no dice roll / server-side draw
 * until the Observatory in SP5), so every action a client may take is validated here.
 */
export function parseStPetersburgAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'action must be an object' };
  }
  const action = raw as { type?: unknown; row?: unknown; index?: unknown };

  if (action.type === 'PASS') {
    return { ok: true, action: { type: 'PASS' } };
  }

  if (action.type === 'BUY' || action.type === 'ADD_TO_HAND') {
    if (!isRow(action.row)) {
      return { ok: false, message: `${action.type}.row must be "upper" or "lower"` };
    }
    if (!isIndex(action.index)) {
      return { ok: false, message: `${action.type}.index must be a non-negative integer` };
    }
    return { ok: true, action: { type: action.type, row: action.row, index: action.index } };
  }

  if (action.type === 'PLAY_FROM_HAND') {
    if (!isIndex(action.index)) {
      return { ok: false, message: 'PLAY_FROM_HAND.index must be a non-negative integer' };
    }
    return { ok: true, action: { type: 'PLAY_FROM_HAND', index: action.index } };
  }

  return { ok: false, message: `unknown action type: ${String(action.type)}` };
}
