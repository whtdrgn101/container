import { describe, expect, it } from 'vitest';
import { applyAction, pass, place } from '../actions';
import type { RussianRailroadsState } from '../core';
import { activeId, newGame } from './helpers';

/** Everyone passes once, closing the round (nobody placed → one pass per seat). */
function passRound(state: RussianRailroadsState): RussianRailroadsState {
  let s = state;
  for (let i = 0; i < s.players.length; i += 1) s = pass(s, activeId(s));
  return s;
}

describe('pass', () => {
  it('marks the seat passed and advances the turn (round not yet over)', () => {
    const state = newGame(4);
    const first = activeId(state);
    const next = pass(state, first);
    expect(next.players.find((p) => p.id === first)!.passed).toBe(true);
    expect(activeId(next)).not.toBe(first);
    expect(next.round).toBe(1);
  });

  it('skips passed seats when advancing', () => {
    let state = newGame(3);
    const a = activeId(state);
    state = pass(state, a); // a passed
    const b = activeId(state);
    state = place(state, b, 'coins'); // b acts, still un-passed → turn goes to c
    const c = activeId(state);
    expect(c).not.toBe(a);
    expect(c).not.toBe(b);
  });

  it('closes the round when all pass: returns workers, clears occupancy, slides the strip, advances round', () => {
    let state = newGame(4);
    // The opening seat spends a worker before the round closes, to prove workers are returned.
    const opener = activeId(state);
    state = place(state, opener, 'coins');
    const stripBefore = state.engineerStrip;
    // Everyone (including the opener) passes to close the round.
    state = passRound(state);

    expect(state.round).toBe(2);
    expect(state.status).toBe('active');
    expect(state.actionSpaces).toEqual({});
    expect(state.players.every((p) => !p.passed)).toBe(true);
    expect(state.players.find((p) => p.id === opener)!.workersAvailable).toBe(
      state.players.find((p) => p.id === opener)!.workersTotal,
    );
    // Strip slid one right: left-most now empty, previous right-most dropped.
    expect(state.engineerStrip[0]).toBeNull();
    expect(state.engineerStrip).toHaveLength(stripBefore.length);
    // Round 2 opens with the turn-order starting seat.
    expect(state.activePlayerIndex).toBe(state.turnOrder[0]);
    // Feed narrates the round rollover.
    expect(state.log.at(-1)).toMatchObject({ type: 'PASS', payload: { closedRound: 1, nextRound: 2 } });
  });

  it('ends the game after the final round with a stub shared result', () => {
    let state = newGame(2); // 6 rounds
    for (let r = 0; r < state.rounds; r += 1) state = passRound(state);

    expect(state.status).toBe('ended');
    if (state.status !== 'ended') throw new Error('unreachable');
    expect([...state.winnerIds].sort()).toEqual(['p1', 'p2']);
    expect(state.results).toEqual([
      { playerId: 'p1', total: 0 },
      { playerId: 'p2', total: 0 },
    ]);
    expect(state.log.at(-1)).toMatchObject({ type: 'PASS', payload: { closedRound: 6, gameEnded: true } });
    // No further moves once ended.
    expect(() => applyAction(state, 'p1', { type: 'PASS' })).toThrowError();
  });
});
