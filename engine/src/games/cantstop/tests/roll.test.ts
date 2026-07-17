import { describe, expect, it } from 'vitest';
import { roll } from '../actions';
import { makeState, expectError } from './helpers';

describe('roll', () => {
  it('moves to the selecting phase and stores the dice when a play exists', () => {
    const next = roll(makeState(), 'p1', [1, 2, 3, 4]);
    expect(next.phase).toBe('selecting');
    expect(next.dice).toEqual([1, 2, 3, 4]);
    expect(next.version).toBe(1);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'ROLL', playerId: 'p1', payload: { dice: [1, 2, 3, 4] } });
  });

  it('increments the turn roll count on each successful roll', () => {
    const first = roll(makeState(), 'p1', [1, 2, 3, 4]);
    expect(first.rollsThisTurn).toBe(1);
    // After choosing a pairing the seat is back to rolling with the count carried; the next roll bumps it.
    const second = roll({ ...first, phase: 'rolling', dice: null, rollsThisTurn: 1 }, 'p1', [1, 2, 3, 4]);
    expect(second.rollsThisTurn).toBe(2);
  });

  it('busts and passes the turn when no split can advance anything', () => {
    // Three runners already at the top of their columns, so nothing can move and no marker is free.
    const state = makeState({ runners: { 2: 3, 3: 5, 4: 7 }, rollsThisTurn: 4 });
    const next = roll(state, 'p1', [1, 1, 1, 1]);
    expect(next.runners).toEqual({});
    expect(next.phase).toBe('rolling');
    expect(next.dice).toBeNull();
    expect(next.activePlayerIndex).toBe(1);
    expect(next.turn).toBe(2);
    expect(next.rollsThisTurn).toBe(0); // the next seat starts fresh
    expect(next.log.at(-1)).toMatchObject({ type: 'BUST', playerId: 'p1' });
  });

  it('wraps the active seat on a bust in the last seat', () => {
    const state = makeState({ activePlayerIndex: 1, runners: { 2: 3, 3: 5, 4: 7 } });
    expect(roll(state, 'p2', [1, 1, 1, 1]).activePlayerIndex).toBe(0);
  });

  it('rejects rolling while a pairing is still owed', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 2, 3, 4] });
    expectError(() => roll(state, 'p1', [1, 2, 3, 4]), 'WRONG_PHASE');
  });

  it('rejects the wrong number of dice', () => {
    expectError(() => roll(makeState(), 'p1', [1, 2, 3] as unknown as [number, number, number, number]), 'INVALID_ROLL');
  });

  it('rejects a die outside 1–6', () => {
    expectError(() => roll(makeState(), 'p1', [1, 2, 3, 7]), 'INVALID_ROLL');
  });
});
