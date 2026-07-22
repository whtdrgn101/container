import type { Action, CardKind } from '@game-hub/engine/stpetersburg';
import type { ParseResult } from '../module';

/** A non-negative integer index into a row or a hand. */
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/** Is `value` a valid board row name? */
function isRow(value: unknown): value is 'upper' | 'lower' {
  return value === 'upper' || value === 'lower';
}

/** Is `value` an acceptable displacement target — a card instance id, or absent (SP4, pg. 7)? */
function isDisplace(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

/** Is `value` one of the four card-group / stack names (Observatory draw, SP5)? */
function isStack(value: unknown): value is CardKind {
  return value === 'worker' || value === 'building' || value === 'aristocrat' || value === 'trading';
}

/** Is `value` a valid Observatory resolve choice (SP5, pg. 8)? */
function isResolveChoice(value: unknown): value is 'buy' | 'hand' | 'discard' {
  return value === 'buy' || value === 'hand' || value === 'discard';
}

/**
 * Validate opaque JSON into a typed Saint Petersburg `Action` (roadmap SP1 + SP3 + SP4).
 *
 * Accepts every client-sendable move: `PASS`; `BUY { row, index, displace? }`; `ADD_TO_HAND { row, index }`;
 * `PLAY_FROM_HAND { index, displace? }`; and the SP5 special-card moves — `PUB_BUY { points }`,
 * `OBSERVATORY_DRAW { stack }`, `OBSERVATORY_RESOLVE { choice, displace? }` (pg. 8). `displace` (SP4) is
 * the optional instance id of a card to discard when buying/playing a **trading** card (pg. 7) — the engine
 * enforces that a trading card carries one and a plain card does not. The Observatory's draw is a **pure
 * engine action** (the stack top is deterministic — shuffled at setup), so it needs no server-side rng and
 * every action a client may take is validated here; nothing is server-only.
 */
export function parseStPetersburgAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, message: 'action must be an object' };
  }
  const action = raw as { type?: unknown; row?: unknown; index?: unknown; displace?: unknown; points?: unknown; stack?: unknown; choice?: unknown };

  if (action.type === 'PASS') {
    return { ok: true, action: { type: 'PASS' } };
  }

  if (action.type === 'BUY') {
    if (!isRow(action.row)) {
      return { ok: false, message: 'BUY.row must be "upper" or "lower"' };
    }
    if (!isIndex(action.index)) {
      return { ok: false, message: 'BUY.index must be a non-negative integer' };
    }
    if (!isDisplace(action.displace)) {
      return { ok: false, message: 'BUY.displace must be a card id string when present' };
    }
    return { ok: true, action: { type: 'BUY', row: action.row, index: action.index, ...(action.displace !== undefined ? { displace: action.displace } : {}) } };
  }

  if (action.type === 'ADD_TO_HAND') {
    if (!isRow(action.row)) {
      return { ok: false, message: 'ADD_TO_HAND.row must be "upper" or "lower"' };
    }
    if (!isIndex(action.index)) {
      return { ok: false, message: 'ADD_TO_HAND.index must be a non-negative integer' };
    }
    return { ok: true, action: { type: 'ADD_TO_HAND', row: action.row, index: action.index } };
  }

  if (action.type === 'PLAY_FROM_HAND') {
    if (!isIndex(action.index)) {
      return { ok: false, message: 'PLAY_FROM_HAND.index must be a non-negative integer' };
    }
    if (!isDisplace(action.displace)) {
      return { ok: false, message: 'PLAY_FROM_HAND.displace must be a card id string when present' };
    }
    return { ok: true, action: { type: 'PLAY_FROM_HAND', index: action.index, ...(action.displace !== undefined ? { displace: action.displace } : {}) } };
  }

  if (action.type === 'PUB_BUY') {
    if (typeof action.points !== 'number' || !Number.isInteger(action.points) || action.points < 0) {
      return { ok: false, message: 'PUB_BUY.points must be a non-negative integer' };
    }
    return { ok: true, action: { type: 'PUB_BUY', points: action.points } };
  }

  if (action.type === 'OBSERVATORY_DRAW') {
    if (!isStack(action.stack)) {
      return { ok: false, message: 'OBSERVATORY_DRAW.stack must be a card-group name' };
    }
    return { ok: true, action: { type: 'OBSERVATORY_DRAW', stack: action.stack } };
  }

  if (action.type === 'OBSERVATORY_RESOLVE') {
    if (!isResolveChoice(action.choice)) {
      return { ok: false, message: 'OBSERVATORY_RESOLVE.choice must be "buy", "hand", or "discard"' };
    }
    if (!isDisplace(action.displace)) {
      return { ok: false, message: 'OBSERVATORY_RESOLVE.displace must be a card id string when present' };
    }
    return { ok: true, action: { type: 'OBSERVATORY_RESOLVE', choice: action.choice, ...(action.displace !== undefined ? { displace: action.displace } : {}) } };
  }

  return { ok: false, message: `unknown action type: ${String(action.type)}` };
}
