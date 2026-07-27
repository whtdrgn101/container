import { describe, expect, it } from 'vitest';
import { select } from '../actions';
import { makeState, expectError } from './helpers';

describe('select', () => {
  it('advances the chosen columns and returns to the rolling phase', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    const next = select(state, 'p1', [3, 7]);
    expect(next.runners).toEqual({ 3: 1, 7: 1 });
    expect(next.phase).toBe('rolling');
    expect(next.dice).toBeNull();
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'SELECT', playerId: 'p1', payload: { columns: [3, 7] } });
  });

  it('does not end the turn (the seat stays active)', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    const next = select(state, 'p1', [5, 5]);
    expect(next.activePlayerIndex).toBe(0);
    expect(next.runners).toEqual({ 5: 2 });
  });

  it('rejects a pairing that is not legal for these dice', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expectError(() => select(state, 'p1', [3, 4]), 'INVALID_SELECTION');
  });

  it('rejects selecting when no dice are on the table', () => {
    expectError(() => select(makeState(), 'p1', [3, 7]), 'WRONG_PHASE');
  });
});
