/**
 * Stone Age's strength-benchmark entry point — adapts self-play to the kernel `runBenchmark` (REVIEW.md
 * Tier 5). It knows the two game-specific things the kernel can't: how to seed a game, and how to read the
 * winning seats off the end state.
 *
 * **Stone Age has two randomness sources**: the setup deck shuffle (into `createGame`) and the per-turn
 * gather dice (into self-play). `makeInitial(seed)` seeds both from the game seed — different seeds are
 * different decks *and* different dice — and bundles the dice generator so a game reproduces exactly. Each
 * rotation of the candidate replays the same board+dice for a fair comparison.
 *
 * NB: `tests/benchmark.test.ts` already benches the live policy against the frozen `legacyPolicy.ts`
 * head-to-head; this entry point is the same measurement expressed through the shared kernel utility, so
 * the same freeze-then-measure convention applies (pass the frozen policy as `baseline`).
 */
import { createGame } from '../engine';
import type { StoneAgeState } from '../engine';
import { mulberry32, runBenchmark, type BenchmarkResult } from '@game-hub/kernel/bot';
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
  readonly state: StoneAgeState;
  readonly rng: () => number;
}

function winningSeats(state: StoneAgeState): number[] {
  if (state.status !== 'ended') throw new Error('Stone Age benchmark game did not reach a natural end');
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
      state: createGame({
        id: `bench-${seed}`,
        players: Array.from({ length: seats }, (_, i) => ({ name: `P${i + 1}` })),
        rng: mulberry32(seed * 2654435761 + 1),
      }),
      rng: mulberry32(seed * 40503 + 7919),
    }),
    play: ({ state, rng }, policyBySeat) => {
      const policies = new Map(policyBySeat.map((policy, seat) => [`p${seat + 1}`, policy]));
      return winningSeats(playSelfPlay(state, { rng, policies }).state);
    },
  });
}
