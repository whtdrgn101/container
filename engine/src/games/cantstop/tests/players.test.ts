import { describe, expect, it } from 'vitest';
import { activePlayer, seatOf, withPlayer } from '../internal';
import { makeState, expectError } from './helpers';

describe('player helpers', () => {
  it('seatOf finds a seat by id', () => {
    expect(seatOf(makeState(), 'p2')).toBe(1);
  });

  it('seatOf throws for an unknown id', () => {
    expectError(() => seatOf(makeState(), 'ghost'), 'PLAYER_NOT_FOUND');
  });

  it('activePlayer returns the seat on the clock', () => {
    expect(activePlayer(makeState({ activePlayerIndex: 1 })).id).toBe('p2');
  });

  it('withPlayer replaces exactly one seat', () => {
    const state = makeState();
    const replaced = withPlayer(state, 1, { id: 'p2', name: 'Bob', progress: { 7: 4 } });
    expect(replaced[0]).toBe(state.players[0]);
    expect(replaced[1]!.progress).toEqual({ 7: 4 });
  });
});
