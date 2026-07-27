import { createGame, viewFor } from '../../engine';
import type { CantStopState, CantStopView } from '../../engine';

/** A fresh game with the given seat names (two by default). */
export function newGame(names: string[] = ['Ann', 'Bob']): CantStopState {
  return createGame({ id: 'g1', players: names.map((name) => ({ name })) });
}

/**
 * A game with fields overridden — the quick way to build a mid-turn position. The cast bridges the
 * end-state discriminated union: a fixture builder fabricates an arbitrary position, and spreading
 * `Partial<CantStopState>` over the active base can't be proven to land on a single arm.
 */
export function makeState(overrides: Partial<CantStopState> = {}, names?: string[]): CantStopState {
  return { ...newGame(names), ...overrides } as CantStopState;
}

/** Project a state for a seat (a no-op redaction in Can't Stop) — what `decide` expects. */
export function viewOf(state: CantStopState, viewer = 'p1'): CantStopView {
  return viewFor(state, viewer);
}

/** A small deterministic PRNG (mulberry32), so self-play reproduces from a seed. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
