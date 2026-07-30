import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../random';
import { runBenchmark, wilsonInterval } from '../benchmark';

describe('wilsonInterval', () => {
  it('matches the textbook value for 50/100 at 95%', () => {
    const [lo, hi] = wilsonInterval(50, 100);
    // Known Wilson 95% interval for p̂ = 0.5, n = 100.
    expect(lo).toBeCloseTo(0.4038, 3);
    expect(hi).toBeCloseTo(0.5962, 3);
  });

  it('is symmetric around 0.5 and clamps to [0, 1]', () => {
    const [lo, hi] = wilsonInterval(5, 5); // p̂ = 1
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBe(1); // clamped, never above 1
    const [lo0] = wilsonInterval(0, 5); // p̂ = 0
    expect(lo0).toBe(0); // clamped, never below 0
  });

  it('accepts fractional successes (shared wins)', () => {
    const [lo, hi] = wilsonInterval(2.5, 5);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeLessThan(1);
    expect((lo + hi) / 2).toBeCloseTo(0.5, 5); // centered on p̂ = 0.5
  });

  it('returns [0, 1] for an empty sample', () => {
    expect(wilsonInterval(0, 0)).toEqual([0, 1]);
  });
});

// `mulberry32` itself is tested in `src/tests/random.test.ts` — it moved to the `.` barrel in kernel
// 1.2.0. It is still imported *through* `./bot` by every game's bench, which `bot/index.ts` re-exports;
// here it is used only as a deterministic seed source for the harness's own determinism test.

describe('runBenchmark', () => {
  // A hand-built game where a designated seat always wins, so we can check the harness bookkeeping
  // (rotation, seed blocking, counting) without any real game.
  const candidate = 'C';
  const baseline = 'B';

  it('rotates the candidate through every seat and blocks seeds per rotation', () => {
    const seenSeats: number[] = [];
    const seenSeeds: number[] = [];
    const result = runBenchmark<number, string>({
      games: 4,
      seats: 2,
      candidate,
      baseline,
      makeInitial: (seed) => {
        seenSeeds.push(seed);
        return seed;
      },
      play: (_seed, policyBySeat) => {
        const cSeat = policyBySeat.indexOf(candidate);
        seenSeats.push(cSeat);
        return [cSeat]; // the candidate's seat always wins
      },
    });
    expect(seenSeats).toEqual([0, 1, 0, 1]); // candidate rotates through both seats
    expect(seenSeeds).toEqual([0, 0, 1, 1]); // same board replayed once per candidate seat
    expect(result.candidateWins).toBe(4);
    expect(result.winRate).toBe(1);
  });

  it('never places both policies in the same seat', () => {
    runBenchmark<number, string>({
      games: 6,
      seats: 3,
      candidate,
      baseline,
      makeInitial: (seed) => seed,
      play: (_seed, policyBySeat) => {
        expect(policyBySeat.filter((p) => p === candidate)).toHaveLength(1);
        expect(policyBySeat.filter((p) => p === baseline)).toHaveLength(2);
        return [policyBySeat.indexOf(candidate)];
      },
    });
  });

  it('counts a shared win as a fraction', () => {
    const result = runBenchmark<number, string>({
      games: 4,
      seats: 2,
      candidate,
      baseline,
      makeInitial: (seed) => seed,
      play: () => [0, 1], // both seats "win" — a two-way tie
    });
    expect(result.candidateWins).toBe(2); // 0.5 credit per game × 4
    expect(result.winRate).toBe(0.5);
  });

  it('gives the candidate no credit when its seat never wins', () => {
    const result = runBenchmark<number, string>({
      games: 4,
      seats: 2,
      candidate,
      baseline,
      makeInitial: (seed) => seed,
      play: (_seed, policyBySeat) => [policyBySeat.indexOf(baseline)], // a baseline seat always wins
    });
    expect(result.candidateWins).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.ci95[0]).toBe(0);
  });

  it('is deterministic — same inputs, same result', () => {
    const opts = {
      games: 5,
      seats: 2,
      candidate,
      baseline,
      makeInitial: (seed: number) => mulberry32(seed),
      play: (rng: () => number, policyBySeat: readonly string[]) =>
        rng() < 0.5 ? [policyBySeat.indexOf(candidate)] : [policyBySeat.indexOf(baseline)],
    };
    expect(runBenchmark(opts)).toEqual(runBenchmark(opts));
  });

  it('handles zero games without dividing by zero', () => {
    const result = runBenchmark<number, string>({
      games: 0,
      seats: 2,
      candidate,
      baseline,
      makeInitial: (seed) => seed,
      play: () => [0],
    });
    expect(result).toEqual({ games: 0, candidateWins: 0, winRate: 0, ci95: [0, 1] });
  });
});
