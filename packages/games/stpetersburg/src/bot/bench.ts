/**
 * Saint Petersburg's strength-benchmark entry point — adapts self-play to the kernel `runBenchmark`
 * (REVIEW.md Tier 5). It knows the two game-specific things the kernel can't: how to seed a game, and how
 * to read the winning seats off the end state.
 *
 * **Saint Petersburg's only randomness is the setup shuffle** (four stacks into `createGame`); nothing the
 * bot decides consumes an rng. So `makeInitial(seed)` seeds the shuffle and the state alone is the whole
 * setup — no dice to bundle — and `play` needs no injected generator. Each rotation of the candidate
 * replays the same shuffled board for a fair comparison.
 */
import { createGame } from '../engine';
import type { StPetersburgState } from '../engine';
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

function winningSeats(state: StPetersburgState): number[] {
  if (state.status !== 'ended') throw new Error('Saint Petersburg benchmark game did not reach a natural end');
  return state.winnerIds.map((id) => state.players.findIndex((player) => player.id === id));
}

export function benchmark(options: StrengthBenchOptions): BenchmarkResult {
  const seats = options.seats ?? 2;
  return runBenchmark<StPetersburgState, DecideFn>({
    games: options.games,
    seats,
    candidate: options.candidate ?? decide,
    baseline: options.baseline ?? decide,
    makeInitial: (seed) =>
      createGame({
        id: `bench-${seed}`,
        players: Array.from({ length: seats }, (_, i) => ({ name: `P${i + 1}` })),
        rng: mulberry32(seed * 2654435761 + 1),
      }),
    play: (initial, policyBySeat) => {
      const policies = new Map(policyBySeat.map((policy, seat) => [`p${seat + 1}`, policy]));
      return winningSeats(playSelfPlay(initial, { policies }).state);
    },
  });
}
