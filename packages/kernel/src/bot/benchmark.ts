/**
 * The bot **strength** benchmark, shared by every game (REVIEW.md Tier 5 — "bot strength is entirely
 * unmeasured").
 *
 * Self-play's own tests answer only "is every move legal and does the game end?". They cannot tell you
 * whether a policy change made a bot *stronger* — that is a measurement, not an assertion. This utility
 * turns tuning into a measurement: play N seeded games with **asymmetric seats** (a `candidate` policy in
 * one seat, a `baseline` in the rest), rotate the candidate through every seat so a seat advantage can't
 * masquerade as strength, and report the candidate's win rate with a Wilson 95% confidence interval.
 *
 * It is the enabling move for the "calibrate-then-commit" convention: freeze a copy of the current policy
 * as the `baseline`, tune the live policy, run this, and commit only when the candidate's win rate is
 * significantly above 50% (its CI lower bound clears it).
 *
 * **Pure and deterministic** given the seeds (kernel rule — no `Math.random`, no `Date`). The game supplies
 * everything game-specific: `makeInitial(seed)` seeds a board, and `play(initial, policyBySeat)` runs one
 * game and reports which *seat indices* won. The kernel stays ignorant of what any game is — it only knows
 * seats, policies, and how to count and interval a win rate.
 */

/** 95% two-sided normal quantile — the z for the Wilson interval. */
const Z_95 = 1.959963984540054;

/**
 * A small deterministic PRNG (mulberry32) — the seed source every game's bench threads into its setup
 * shuffle and per-turn dice. Pure (no `Math.random`, no `Date`), so a whole bench run reproduces from
 * its seeds. Lives here because seeding is the benchmark's job, not any one game's.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BenchmarkOptions<S, P> {
  /** How many games to play. Fairness is best when this is a multiple of `seats` (each board rotates fully). */
  readonly games: number;
  /** Seats per game. The candidate rotates through seat 0, 1, …, `seats-1`, then repeats. */
  readonly seats: number;
  /** The policy under test. */
  readonly candidate: P;
  /** The frozen policy it plays against, filling every other seat. */
  readonly baseline: P;
  /**
   * Build the initial state for one game from a seed. The game owns its own setup randomness (a seeded
   * `createGame`, plus any per-turn dice source it needs — bundle both into `S`), so the whole benchmark
   * reproduces from `(seed)`. Boards are shared across a rotation block: game `i` uses seed
   * `floor(i / seats)`, so the same board is played once per candidate seat and board luck cancels exactly.
   */
  readonly makeInitial: (seed: number) => S;
  /**
   * Play one game to its end with the given per-seat policies and return the **winning seat indices**
   * (0-based, indexing `policyBySeat`). A shared win returns several; the candidate's credit for that game
   * is `1 / winners.length` if its seat is among them. Must be deterministic in `(initial, policyBySeat)`.
   */
  readonly play: (initial: S, policyBySeat: readonly P[]) => readonly number[];
}

export interface BenchmarkResult {
  /** Games actually played (equals `options.games`). */
  readonly games: number;
  /** The candidate's total credit — whole wins plus fractional shares of shared wins. */
  readonly candidateWins: number;
  /** `candidateWins / games`. */
  readonly winRate: number;
  /** Wilson score 95% confidence interval `[lo, hi]` for the true win rate, clamped to `[0, 1]`. */
  readonly ci95: readonly [number, number];
}

/**
 * The Wilson score interval for a proportion — chosen over the naive normal approximation because it
 * stays inside `[0, 1]` and behaves at the small samples and lopsided rates a bench run actually hits.
 *
 * Accepts a fractional `successes` (shared wins contribute a fraction), which is a mild abuse of the
 * binomial but the right thing here: a half-win is half the evidence, and the interval widens/narrows
 * accordingly.
 */
export function wilsonInterval(successes: number, n: number, z = Z_95): readonly [number, number] {
  if (n <= 0) return [0, 1];
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function runBenchmark<S, P>(options: BenchmarkOptions<S, P>): BenchmarkResult {
  const { games, seats, candidate, baseline, makeInitial, play } = options;

  let candidateWins = 0;
  for (let i = 0; i < games; i += 1) {
    // Rotate the candidate through every seat; replay the same board (seed) once per seat so a
    // start-position advantage cancels across the block instead of counting as strength.
    const candidateSeat = i % seats;
    const seed = Math.floor(i / seats);
    const policyBySeat = Array.from({ length: seats }, (_, seat) => (seat === candidateSeat ? candidate : baseline));

    const winners = play(makeInitial(seed), policyBySeat);
    if (winners.includes(candidateSeat)) {
      candidateWins += 1 / winners.length;
    }
  }

  return {
    games,
    candidateWins,
    winRate: games > 0 ? candidateWins / games : 0,
    ci95: wilsonInterval(candidateWins, games),
  };
}
