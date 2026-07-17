import type { StoneAgeState } from '../core';
import type { Action } from './action';

/**
 * The actions the given seat may take. **Empty at the scaffold** — no action is playable yet; each
 * lands in its own roadmap stage, and this will enumerate them (legal placements, then the per-place
 * actions, …) as they arrive.
 */
export function legalActions(_state: StoneAgeState, _playerId?: string): Action[] {
  return [];
}
