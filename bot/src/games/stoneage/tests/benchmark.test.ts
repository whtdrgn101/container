import { describe, expect, it } from 'vitest';
import { playSelfPlay } from '../selfPlay';
import { legacyDecide } from './legacyPolicy';
import { newGame, seededRng } from './helpers';

/**
 * The strength benchmark: the live value-based policy vs. the frozen pre-rework policy
 * (`legacyPolicy.ts`), head-to-head over seeded 2-player games. Fully deterministic — every game
 * reproduces from its seed — so this suite cannot flake: it either always passes or a policy change
 * genuinely regressed strength. Seats alternate by seed parity to cancel the start-player advantage.
 *
 * The thresholds were set by the calibrate-then-commit rule: measure first, then commit a bar with
 * ≥10 points of headroom under the measured rate, floor 60%.
 */
const SEEDS = 32;

function headToHead(): { wins: number; meanMargin: number } {
  let wins = 0;
  let margin = 0;
  for (let seed = 1; seed <= SEEDS; seed += 1) {
    const newSeat = seed % 2 === 0 ? 'p1' : 'p2';
    const legacySeat = newSeat === 'p1' ? 'p2' : 'p1';
    const result = playSelfPlay(newGame(2, seededRng(seed)), {
      rng: seededRng(seed * 7919),
      policies: new Map([[legacySeat, legacyDecide]]),
    });
    if (!result.completed) throw new Error(`Benchmark game for seed ${seed} did not complete`);
    const totals = new Map(result.state.results!.map((r) => [r.playerId, r.total]));
    margin += totals.get(newSeat)! - totals.get(legacySeat)!;
    if (result.state.winnerIds.includes(newSeat)) wins += result.state.winnerIds.length === 1 ? 1 : 0.5;
  }
  return { wins, meanMargin: margin / SEEDS };
}

describe('Stone Age policy strength benchmark', () => {
  it(`beats the frozen legacy policy over ${SEEDS} seeded head-to-head games`, () => {
    const { wins, meanMargin } = headToHead();
    // Measured at commit time (with the pg. 2 people/food-track caps): 30/32 wins, mean margin
    // +72 pts. Bar set ≥10 percentage points under measured.
    expect(wins).toBeGreaterThanOrEqual(26); // 81.25%
    expect(meanMargin).toBeGreaterThan(20);
  });

  it('a mixed 3-player table (1 live vs 2 legacy) still completes', () => {
    const result = playSelfPlay(newGame(3, seededRng(4242)), {
      rng: seededRng(4243),
      policies: new Map([
        ['p2', legacyDecide],
        ['p3', legacyDecide],
      ]),
    });
    expect(result.completed).toBe(true);
    expect(result.state.results).not.toBeNull();
  });
});
