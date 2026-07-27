import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, bustProbability, pickPairing, scorePairing, shouldRoll, turnProgress } from '../policy';
import { makeState } from './helpers';

const { easy: EASY, normal: NORMAL, hard: HARD } = DIFFICULTIES;

describe('bustProbability', () => {
  it('is 0 at the start of a turn (any roll can place a marker)', () => {
    expect(bustProbability(makeState())).toBe(0);
  });

  it('is 1 when all three markers are out and topped, so nothing can advance', () => {
    expect(bustProbability(makeState({ runners: { 2: 3, 3: 5, 4: 7 } }))).toBe(1);
  });

  it('is strictly between 0 and 1 for a partially-committed turn', () => {
    // Three markers used, two topped (2, 3), only column 12 still advanceable (needs a pair of sixes).
    const p = bustProbability(makeState({ runners: { 2: 3, 3: 5, 12: 2 } }));
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });
});

describe('turnProgress', () => {
  it('sums each runner’s height above the square already banked there', () => {
    expect(turnProgress(makeState({ runners: { 3: 2, 7: 1 } }))).toBe(3);
    const withSquare = makeState({
      runners: { 3: 4 },
      players: [
        { id: 'p1', name: 'Ann', progress: { 3: 1 } },
        { id: 'p2', name: 'Bob', progress: {} },
      ],
    });
    expect(turnProgress(withSquare)).toBe(3); // 4 − 1
  });
});

describe('shouldRoll', () => {
  it('must roll when no runner is out (stopping is illegal)', () => {
    expect(shouldRoll(makeState())).toBe(true);
  });

  it('stops to take the win when the third column would be claimed', () => {
    const state = makeState({ runners: { 2: 3 }, claimed: { 5: 'p1', 9: 'p1' } });
    expect(shouldRoll(state)).toBe(false);
  });

  it('rolls on a free roll (no bust risk)', () => {
    expect(shouldRoll(makeState({ runners: { 7: 1 } }))).toBe(true);
  });

  it('stops when the risk to a big banked turn outweighs the likely gain', () => {
    expect(shouldRoll(makeState({ runners: { 2: 3, 3: 5, 12: 2 } }))).toBe(false);
  });
});

describe('pickPairing', () => {
  it('always returns one of the legal options', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    // Options are [3,7], [4,6], [5,5]; whichever the weights favour, it must be a real one.
    expect([
      [3, 7],
      [4, 6],
      [5, 5],
    ]).toContainEqual(pickPairing(state));
  });

  it('takes a pairing that claims a column over one that does not', () => {
    // A runner sits one below the top of column 2. [1,1,3,4] offers (2,7) — advancing 2 to the top —
    // or (4,5). The claim bonus makes the topping pairing the clear pick.
    const state = makeState({ phase: 'selecting', dice: [1, 1, 3, 4], runners: { 2: 2 } });
    expect(pickPairing(state)).toEqual([2, 7]);
  });

  it('scores a claiming step far above an ordinary one', () => {
    const state = makeState({ runners: { 2: 2 } });
    const claim = scorePairing(state, [2]); // 2→3 tops column 2 (height 3)
    const ordinary = scorePairing(state, [7]);
    expect(claim).toBeGreaterThan(ordinary);
  });
});

// The CS4 difficulty tiers — parameter sets over the *same* bust-probability EV machinery. The strength
// *ordering* is proven by `difficulty.bench.test.ts`; these assert the mechanism each tier turns.
describe('difficulty tiers', () => {
  it('the default (no params) is byte-identical to the frozen NORMAL tier', () => {
    // The whole point of the tiers: `normal` must not shift, or self-play and the baselines move.
    const state = makeState({ runners: { 2: 3, 3: 5, 12: 2 } });
    expect(shouldRoll(state)).toBe(shouldRoll(state, NORMAL));
    expect(pickPairing(makeState({ phase: 'selecting', dice: [1, 1, 3, 4], runners: { 2: 2 } }))).toEqual(
      pickPairing(makeState({ phase: 'selecting', dice: [1, 1, 3, 4], runners: { 2: 2 } }), NORMAL),
    );
    expect(scorePairing(state, [2])).toBe(scorePairing(state, [2], NORMAL));
  });

  it('easy banks the moment bust probability crosses its threshold (even where normal would too)', () => {
    // p ≈ 0.87 here (two markers topped, only column 12 advanceable): easy stops on the threshold line.
    const state = makeState({ runners: { 2: 3, 3: 5, 12: 1 } });
    expect(bustProbability(state)).toBeGreaterThan(EASY.stopThreshold!);
    expect(shouldRoll(state, EASY)).toBe(false);
  });

  it('easy still rolls below its threshold (falls through to the EV line)', () => {
    // p ≈ 0.004: under the threshold, so easy decides on EV like normal — and rolls.
    const state = makeState({ runners: { 2: 3, 3: 5 } });
    expect(bustProbability(state)).toBeLessThan(EASY.stopThreshold!);
    expect(shouldRoll(state, EASY)).toBe(true);
  });

  it('hard rolls on where normal stops when an opponent is one claim from winning (urgency 1)', () => {
    // p ≈ 0.47, three steps at risk: normal banks, but Bob holding two columns makes hard race.
    const state = makeState({
      runners: { 2: 1, 3: 1, 11: 1 },
      claimed: { 5: 'p2', 9: 'p2' },
    });
    expect(shouldRoll(state, NORMAL)).toBe(false);
    expect(shouldRoll(state, HARD)).toBe(true);
  });

  it('hard races harder still when that opponent is also within reach of a third column (urgency 2)', () => {
    // p ≈ 0.56: normal and urgency-1 both bank; only the level-2 boost (opponent near a third top) rolls.
    const state = makeState({
      runners: { 2: 1, 3: 1, 12: 1 },
      claimed: { 5: 'p2', 9: 'p2' },
      players: [
        { id: 'p1', name: 'Ann', progress: {} },
        { id: 'p2', name: 'Bob', progress: { 2: 1 } }, // column 2 (height 3) is two steps from its top
      ],
    });
    expect(shouldRoll(state, NORMAL)).toBe(false);
    expect(shouldRoll(state, HARD)).toBe(true);
  });

  it('hard prefers completing a column more sharply while racing (scaled claim bonus)', () => {
    // The active seat itself holds two columns and a runner one below a third top — its live runner
    // counts toward urgency, so hard values the claiming pairing above the same pairing at normal.
    const state = makeState({
      runners: { 2: 2 }, // column 2 (height 3): the pairing [2] tops it
      claimed: { 5: 'p1', 9: 'p1' },
    });
    expect(scorePairing(state, [2], HARD)).toBeGreaterThan(scorePairing(state, [2], NORMAL));
  });

  it('no urgency when no seat is close (hard falls back to the plain EV rule)', () => {
    const state = makeState({ runners: { 2: 1, 3: 1, 11: 1 } }); // nobody has any claims
    expect(shouldRoll(state, HARD)).toBe(shouldRoll(state, NORMAL));
  });
});
