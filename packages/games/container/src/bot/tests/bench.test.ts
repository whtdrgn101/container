import { describe, expect, it } from 'vitest';
import { benchmark } from '../bench';

describe('container strength bench', () => {
  // A self-bench (candidate === baseline, the default) over a handful of seeded games. We assert the
  // harness *runs a real game to its end and reports a sane rate* — not ≈50%, which is far too noisy on
  // this few games to assert without flaking. The measurement of strength is the bench script's job.
  it('runs seeded games and reports a win rate in [0, 1]', () => {
    // Container is 3–5 players — bench it at its 3-seat minimum.
    const result = benchmark({ games: 3, seats: 3 });
    expect(result.games).toBe(3);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.candidateWins).toBeLessThanOrEqual(3);
    expect(result.ci95[0]).toBeLessThanOrEqual(result.ci95[1]);
  });

  it('is deterministic', () => {
    expect(benchmark({ games: 3, seats: 3 })).toEqual(benchmark({ games: 3, seats: 3 }));
  });
});
