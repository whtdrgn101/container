import { describe, expect, it } from 'vitest';
import { benchmark, decideAt } from '../bench';

/**
 * The difficulty tiers, proven by the strength harness (CS4) — the calibrate-then-commit convention's
 * first real use. A tier is a parameter set over the *same* exact-probability model, so "harder" is a
 * claim about outcomes, not code: only the seat-rotated benchmark can tell whether `hard` actually
 * beats `normal` (self-play only proves legality + termination).
 *
 * **Why a directional bound, not a CI lower bound.** Each `bustProbability` call scores all 6^4 dice
 * against the engine, so a game is ~85ms and the CI over a fast (~10s) run is far too wide to clear
 * 50%. The benchmark is fully deterministic (seeded per game index), so the win rate at a fixed `GAMES`
 * is a *fixed number* — asserting it exceeds 50% is a stable, meaningful smoke test of the ordering.
 * The real significance test is the env-gated `CANTSTOP_BENCH_GAMES` run below: at 1200 games it shows
 * `hard` beating `normal` 53.0% with a Wilson CI of [0.502, 0.558] — lower bound clear of 50% — and
 * `normal` beating `easy` 59.0% with [0.562, 0.618]. Run it after any retune:
 *
 *   CANTSTOP_BENCH_GAMES=1200 pnpm --filter @game-hub/game-cantstop exec vitest run difficulty.bench
 */

// Small enough that both pairings finish fast (aim ≤ ~15s), large enough to be directional. At this
// fixed, deterministic count normal beats easy 0.550 and hard beats normal 0.525 — both clear of 50%.
// The 60s per-test timeouts are sized to CI, not local: a free-runner vCPU under coverage runs the
// slower pairing in ~22s (vs ~3s locally, measured with CI's one-fork-per-package cap), so 60s is
// real headroom over a stable number — a wedged test still dies well before vitest's file-level cap.
const GAMES = 40;
const SEATS = 2;

const BIG = Number(process.env.CANTSTOP_BENCH_GAMES ?? 0);

describe('cantstop difficulty ordering (harness-proven)', () => {
  it('normal beats easy — the frozen baseline out-earns the risk-shy tier', () => {
    const result = benchmark({ games: GAMES, seats: SEATS, candidate: decideAt('normal'), baseline: decideAt('easy') });
    expect(result.games).toBe(GAMES);
    expect(result.winRate).toBeGreaterThan(0.5);
  }, 60000);

  it('hard beats normal — endgame urgency out-races the frozen baseline', () => {
    const result = benchmark({ games: GAMES, seats: SEATS, candidate: decideAt('hard'), baseline: decideAt('normal') });
    expect(result.winRate).toBeGreaterThan(0.5);
  }, 60000);

  it('is deterministic (a fixed win rate at a fixed game count)', () => {
    // A handful of games is plenty to prove reproducibility — the full run's cost isn't needed here.
    const a = benchmark({ games: 8, seats: SEATS, candidate: decideAt('hard'), baseline: decideAt('normal') });
    const b = benchmark({ games: 8, seats: SEATS, candidate: decideAt('hard'), baseline: decideAt('normal') });
    expect(a).toEqual(b);
  }, 60000);

  // Env-gated significance run — slow (minutes), so it only runs when CANTSTOP_BENCH_GAMES is set. At a
  // large N the Wilson CI lower bound clears 50% for *both* pairings, which is the real proof of order.
  it.runIf(BIG > 0)(
    'big calibration run: both CI lower bounds clear 50%',
    () => {
      const ne = benchmark({ games: BIG, seats: SEATS, candidate: decideAt('normal'), baseline: decideAt('easy') });
      const hn = benchmark({ games: BIG, seats: SEATS, candidate: decideAt('hard'), baseline: decideAt('normal') });
      expect(ne.ci95[0]).toBeGreaterThan(0.5);
      expect(hn.ci95[0]).toBeGreaterThan(0.5);
    },
    600000,
  );
});
