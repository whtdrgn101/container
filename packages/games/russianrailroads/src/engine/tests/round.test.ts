import { describe, expect, it } from 'vitest';
import { allPassed, nextActiveSeat, slideEngineerStrip } from '../internal';
import type { Engineer } from '../core';
import { newGame } from './helpers';

describe('round helpers', () => {
  it('nextActiveSeat returns null when every seat has passed', () => {
    const state = newGame(2);
    const allPassedState = { ...state, players: state.players.map((p) => ({ ...p, passed: true })) };
    expect(allPassed(allPassedState)).toBe(true);
    expect(nextActiveSeat(allPassedState)).toBeNull();
  });

  it('nextActiveSeat wraps around to the next un-passed seat', () => {
    const state = newGame(3);
    // Pass the seat after the active one; advancing from active should skip it.
    const order = state.turnOrder;
    const secondSeat = order[1]!;
    const patched = {
      ...state,
      activePlayerIndex: order[0]!,
      players: state.players.map((p, i) => (i === secondSeat ? { ...p, passed: true } : p)),
    };
    expect(nextActiveSeat(patched)).toBe(order[2]);
  });

  it('slideEngineerStrip drops the right-most and empties the left-most', () => {
    const e = (n: number): Engineer => ({ id: `eng-${n}`, number: n, stack: 'A', action: 'placeholder' });
    const strip = [e(1), e(2), e(3)];
    expect(slideEngineerStrip(strip)).toEqual([null, e(1), e(2)]);
  });
});
