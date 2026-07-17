import { describe, expect, it } from 'vitest';
import { bustProbability, pickPairing, scorePairing, shouldRoll, turnProgress } from '../policy';
import { makeState } from './helpers';

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
    expect([[3, 7], [4, 6], [5, 5]]).toContainEqual(pickPairing(state));
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
