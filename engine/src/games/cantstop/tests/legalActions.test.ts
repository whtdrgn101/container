import { describe, expect, it } from 'vitest';
import { legalActions } from '../actions';
import { makeState } from './helpers';

describe('legalActions', () => {
  it('is empty once the game has ended', () => {
    expect(legalActions(makeState({ status: 'ended' }))).toEqual([]);
  });

  it('is empty for an off-turn seat', () => {
    expect(legalActions(makeState(), 'p2')).toEqual([]);
  });

  it('offers one SELECT per legal pairing while selecting', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expect(legalActions(state)).toEqual([
      { type: 'SELECT', columns: [3, 7] },
      { type: 'SELECT', columns: [4, 6] },
      { type: 'SELECT', columns: [5, 5] },
    ]);
  });

  it('offers STOP while rolling once a runner is out', () => {
    expect(legalActions(makeState({ runners: { 3: 1 } }), 'p1')).toEqual([{ type: 'STOP' }]);
  });

  it('offers nothing while rolling before the first move (roll is server-only)', () => {
    expect(legalActions(makeState())).toEqual([]);
  });
});
