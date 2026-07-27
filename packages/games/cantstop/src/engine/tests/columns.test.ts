import { describe, expect, it } from 'vitest';
import { applySelection, isLegalSelection, legalSelections, splitSums } from '../internal';
import { makeState } from './helpers';

describe('splitSums', () => {
  it('gives the three pairings of four dice', () => {
    expect(splitSums([1, 2, 3, 4])).toEqual([
      [3, 7],
      [4, 6],
      [5, 5],
    ]);
  });
});

describe('legalSelections', () => {
  it('is empty when there are no dice', () => {
    expect(legalSelections(makeState())).toEqual([]);
  });

  it('forces both columns of a pairing when markers allow (must-place rule)', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expect(legalSelections(state)).toEqual([
      [3, 7],
      [4, 6],
      [5, 5],
    ]);
  });

  it('de-duplicates pairings that repeat across splits', () => {
    const state = makeState({ phase: 'selecting', dice: [3, 4, 3, 4] });
    expect(legalSelections(state)).toEqual([
      [7, 7],
      [6, 8],
    ]);
  });

  it('offers a single-column choice when only one marker is free', () => {
    // Two markers already out (6, 8); one free. Two-new-column pairings become an either/or choice,
    // while a pairing that only bumps the existing 6 runner advances it twice.
    const state = makeState({ phase: 'selecting', dice: [1, 2, 4, 5], runners: { 6: 5, 8: 5 } });
    expect(legalSelections(state)).toEqual([[3], [9], [5], [7], [6, 6]]);
  });

  it('drops a claimed column from a pairing, keeping the playable half', () => {
    const state = makeState({ phase: 'selecting', dice: [2, 4, 3, 5], claimed: { 8: 'p2' } });
    expect(legalSelections(state)).toEqual([[6], [5, 9], [7, 7]]);
  });

  it('keeps only the second half when the first column is claimed', () => {
    const state = makeState({ phase: 'selecting', dice: [2, 4, 3, 5], claimed: { 6: 'p2' } });
    expect(legalSelections(state)).toEqual([[8], [5, 9], [7, 7]]);
  });
});

describe('isLegalSelection', () => {
  it('accepts a legal pairing regardless of order and rejects others', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expect(isLegalSelection(state, [7, 3])).toBe(true);
    expect(isLegalSelection(state, [3, 4])).toBe(false);
  });
});

describe('applySelection', () => {
  it('places new runners just above existing squares', () => {
    expect(applySelection({}, { 4: 2 }, [4])).toEqual({ 4: 3 });
    expect(applySelection({}, {}, [3, 7])).toEqual({ 3: 1, 7: 1 });
  });

  it('advances a column twice for a double', () => {
    expect(applySelection({ 6: 5 }, {}, [6, 6])).toEqual({ 6: 7 });
  });
});
