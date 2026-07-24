/**
 * Can't Stop's strength-benchmark entry point — adapts self-play to the kernel `runBenchmark` (REVIEW.md
 * Tier 5). It knows the two game-specific things the kernel can't: how to seed a game, and how to read the
 * winning seats off the end state.
 *
 * **Can't Stop's setup is fixed; its randomness is the per-turn dice.** So `makeInitial(seed)` bundles a
 * freshly-seeded dice generator alongside the (identical) board — different seeds are different dice
 * sequences, which is what makes two seeded games different. The dice source is remade per game, so the
 * same seed always plays the same dice, and every rotation of the candidate through the seats replays the
 * same board+dice for a fair comparison.
 */
import { createGame } from '@game-hub/engine/cantstop';
import type { CantStopState } from '@game-hub/engine/cantstop';
import { mulberry32, runBenchmark, type BenchmarkResult } from '../../kernel';
import { decide } from './decide';
import { playSelfPlay } from './selfPlay';
import type { DecideFn } from './types';

export interface StrengthBenchOptions {
  readonly games: number;
  readonly seats?: number;
  readonly candidate?: DecideFn;
  readonly baseline?: DecideFn;
}

interface Setup {
  readonly state: CantStopState;
  readonly rng: () => number;
}

function winningSeats(state: CantStopState): number[] {
  if (state.status !== 'ended') throw new Error("Can't Stop benchmark game did not reach a natural end");
  return state.winnerIds.map((id) => state.players.findIndex((player) => player.id === id));
}

export function benchmark(options: StrengthBenchOptions): BenchmarkResult {
  const seats = options.seats ?? 2;
  return runBenchmark<Setup, DecideFn>({
    games: options.games,
    seats,
    candidate: options.candidate ?? decide,
    baseline: options.baseline ?? decide,
    makeInitial: (seed) => ({
      state: createGame({ id: `bench-${seed}`, players: Array.from({ length: seats }, (_, i) => ({ name: `P${i + 1}` })) }),
      rng: mulberry32(seed * 2654435761 + 7919),
    }),
    play: ({ state, rng }, policyBySeat) => {
      const policies = new Map(policyBySeat.map((policy, seat) => [`p${seat + 1}`, policy]));
      return winningSeats(playSelfPlay(state, { rng, policies }).state);
    },
  });
}
