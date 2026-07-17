import type { StoneAgeState } from '../core';

/**
 * Produce the next state after a mechanic: apply the top-level changes, bump the version, and append
 * one move to the log. The single place that touches `version`/`log`.
 */
export function record(
  state: StoneAgeState,
  type: string,
  playerId: string,
  changes: Partial<StoneAgeState> = {},
  payload?: Record<string, unknown>,
): StoneAgeState {
  const version = state.version + 1;
  return {
    ...state,
    ...changes,
    version,
    log: [...state.log, payload ? { seq: version, type, playerId, payload } : { seq: version, type, playerId }],
  };
}
