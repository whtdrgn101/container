import { createGame } from '@game-hub/engine/stoneage';
import type { StoneAgeState } from '@game-hub/engine/stoneage';

/** A deterministic pseudo-random generator (mulberry32) so self-play reproduces from a seed. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh Stone Age game with the given seat count, its building/card decks shuffled from `rng`. */
export function newGame(players: number, rng: () => number): StoneAgeState {
  const names = Array.from({ length: players }, (_, i) => `P${i + 1}`);
  return createGame({ id: 'g1', players: names.map((name) => ({ name })), rng });
}
