import type { CantStopState } from '../core';

/**
 * Produce the next state after a mechanic: apply the given top-level changes, bump the version, and
 * append one move to the log. The single place that touches `version`/`log`, so every mechanic records
 * consistently. (Deliberately its own copy rather than a shared kernel helper — each game's state
 * shape differs, and one worked example isn't enough to abstract over.)
 */
export function record(
  state: CantStopState,
  type: string,
  playerId: string,
  changes: Partial<CantStopState> = {},
  payload?: Record<string, unknown>,
): CantStopState {
  const version = state.version + 1;
  return {
    ...state,
    ...changes,
    version,
    log: [...state.log, payload ? { seq: version, type, playerId, payload } : { seq: version, type, playerId }],
  };
}
