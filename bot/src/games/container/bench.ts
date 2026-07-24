/**
 * Container's strength-benchmark entry point — adapts self-play to the kernel `runBenchmark` (REVIEW.md
 * Tier 5). It knows the two Container-specific things the kernel can't: how to seed a game, and how to
 * read the winning seats off the end state.
 *
 * **Container's only randomness is the scoring-card deal** (the rest of setup is fixed, and the engine is
 * pure). So `makeInitial(seed)` deals the secret cards in a seed-dependent order — that is what makes two
 * seeded games genuinely different tables rather than byte-identical replays. A Container seat's policy is
 * a *bundle* (`SeatPolicy` = decide + bids), because its sealed bids are decided from its own view; the
 * bench seats one per player and self-play routes each seat's bids through its own.
 */
import { SCORING_CARDS, createGame } from '@game-hub/engine/container';
import type { GameState, NewPlayer } from '@game-hub/engine/container';
import { mulberry32, runBenchmark, type BenchmarkResult } from '../../kernel';
import { defaultPolicy, playSelfPlay } from './selfPlay';
import type { SeatPolicy } from './types';

export interface StrengthBenchOptions {
  /** Games to play. */
  readonly games: number;
  /** Seats per game (default 3 — Container's minimum; it does not support 2). */
  readonly seats?: number;
  /** The policy under test (default: the live built-in policy). */
  readonly candidate?: SeatPolicy;
  /** The policy it plays against (default: the live built-in policy — a self-bench baseline). */
  readonly baseline?: SeatPolicy;
}

/** A seed-dependent permutation of the scoring-card ids, so each game deals a different table. */
function shuffledCardIds(seed: number, count: number): string[] {
  const rng = mulberry32(seed * 2654435761 + 1);
  const ids = SCORING_CARDS.map((card) => card.id);
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return ids.slice(0, count);
}

function winningSeats(state: GameState): number[] {
  if (state.status !== 'ended') throw new Error('Container benchmark game did not reach a natural end');
  return state.winnerIds.map((id) => state.players.findIndex((player) => player.id === id));
}

export function benchmark(options: StrengthBenchOptions): BenchmarkResult {
  const seats = options.seats ?? 3;
  return runBenchmark<GameState, SeatPolicy>({
    games: options.games,
    seats,
    candidate: options.candidate ?? defaultPolicy,
    baseline: options.baseline ?? defaultPolicy,
    makeInitial: (seed) => {
      const cardIds = shuffledCardIds(seed, seats);
      const players: NewPlayer[] = Array.from({ length: seats }, (_, i) => ({
        name: `P${i + 1}`,
        scoringCardId: cardIds[i],
      }));
      return createGame({ id: `bench-${seed}`, players });
    },
    play: (initial, policyBySeat) => {
      const policies = new Map(policyBySeat.map((policy, seat) => [`p${seat + 1}`, policy]));
      return winningSeats(playSelfPlay(initial, { policies }).state);
    },
  });
}
