import { describe, expect, it } from 'vitest';
import { benchmark } from '../bench';

describe('cantstop strength bench', () => {
  // A self-bench (candidate === baseline) over a handful of seeded games — assert the harness runs a real
  // game to its end and reports a sane rate, not ≈50% (far too noisy on this few games to assert).
  it('runs seeded games and reports a win rate in [0, 1]', () => {
    const result = benchmark({ games: 4, seats: 2 });
    expect(result.games).toBe(4);
    expect(result.winRate).toBeGreaterThanOrEqual(0);
    expect(result.winRate).toBeLessThanOrEqual(1);
    expect(result.candidateWins).toBeLessThanOrEqual(4);
    expect(result.ci95[0]).toBeLessThanOrEqual(result.ci95[1]);
  });

  it('is deterministic', () => {
    expect(benchmark({ games: 4, seats: 2 })).toEqual(benchmark({ games: 4, seats: 2 }));
  });
});
