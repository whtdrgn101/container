import { record as kernelRecord } from '../../../kernel';
import type { GameState, PlayerState } from '../core';

/**
 * Produce the next state after a mechanic: swap in the new player roster, apply any extra top-level
 * changes, bump the version, and append one move to the log.
 *
 * Container keeps its `players`-first signature (14 call sites lean on it) but delegates the actual
 * version/log bump to the shared kernel `record`, so that logic lives in exactly one place across all
 * games (REVIEW.md §3.2). `players` is folded into `changes` ahead of `extra`, so `extra` may still
 * override it — identical to the old inline `{ ...state, players, ...extra }` ordering.
 */
export function record(
  state: GameState,
  players: readonly PlayerState[],
  type: string,
  playerId: string,
  extra: Partial<GameState> = {},
  payload?: Record<string, unknown>,
): GameState {
  return kernelRecord(state, type, playerId, { players, ...extra }, payload);
}
