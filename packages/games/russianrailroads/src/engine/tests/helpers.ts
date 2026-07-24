import { expect } from 'vitest';
import { createGame } from '../createGame';
import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';

/** A small deterministic PRNG (mulberry32) so a seeded game's whole deal is reproducible. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build a fresh game with `count` seats (default 4), seeded deterministically. */
export function newGame(count = 4, seed = 1): RussianRailroadsState {
  const players = Array.from({ length: count }, (_, i) => ({ name: `P${i + 1}` }));
  return createGame({ id: `g-${count}-${seed}`, players, rng: makeRng(seed) });
}

/** The id of the seat currently on the clock. */
export function activeId(state: RussianRailroadsState): string {
  return state.players[state.activePlayerIndex]!.id;
}

/** Assert `fn` throws a `GameError` with the given code. */
export function expectError(fn: () => unknown, code: string): void {
  expect(fn).toThrowError(GameError);
  try {
    fn();
  } catch (error) {
    expect((error as GameError).code).toBe(code);
  }
}
