import type { GameState, PlayerState } from '../core';

/**
 * Produce the next state after a mechanic: swap in the new player roster, apply any extra top-level
 * changes, bump the version, and append one move to the log. The single place that touches
 * `version`/`log`, so every mechanic records consistently.
 */
export function record(
  state: GameState,
  players: readonly PlayerState[],
  type: string,
  playerId: string,
  extra: Partial<GameState> = {},
  payload?: Record<string, unknown>,
): GameState {
  const version = state.version + 1;
  return {
    ...state,
    players,
    ...extra,
    version,
    log: [...state.log, payload ? { seq: version, type, playerId, payload } : { seq: version, type, playerId }],
  };
}
