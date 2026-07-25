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

/**
 * Force every seat's turn-order card to #1 (pass-reverse = 0 points), so these scoring-phase tests isolate
 * route/industry scoring from the RR6 pass-scoring (which has its own tests). Turn order is unaffected.
 */
function noPassPoints(state: RussianRailroadsState): RussianRailroadsState {
  return { ...state, players: state.players.map((p) => ({ ...p, turnOrderCard: 1 })) };
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

  it('runs the scoring phase at round close and logs the per-player breakdown', () => {
    const state = noPassPoints(newGame(2));
    const closed = passRound(state);
    // Wood-only, so everyone scores 0 this round — but the phase ran and the breakdown is on the wire.
    expect(closed.players.every((p) => p.score === 0)).toBe(true);
    expect(closed.log.at(-1)).toMatchObject({
      type: 'PASS',
      payload: {
        closedRound: 1,
        nextRound: 2,
        scores: [
          { playerId: 'p1', gained: 0 },
          { playerId: 'p2', gained: 0 },
        ],
      },
    });
  });

  it('accumulates real scores across rounds and picks the highest scorer as winner', () => {
    // Plant a scoring board on p1: a green track reached by a #5 loco (5 points/round), so p1 pulls ahead.
    let state = noPassPoints(newGame(2)); // 6 rounds
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === 'p1'
          ? {
              ...p,
              locomotives: [{ number: 5, route: 'transsiberian' }],
              routes: p.routes.map((r) =>
                r.id === 'transsiberian'
                  ? { ...r, spaces: r.spaces.map((_, i) => (i === 4 ? ('green' as const) : null)) }
                  : r,
              ),
            }
          : p,
      ),
    };
    for (let r = 0; r < state.rounds; r += 1) state = passRound(state);

    expect(state.status).toBe('ended');
    if (state.status !== 'ended') throw new Error('unreachable');
    // p1 scores 5/round over 6 rounds = 30 base; no end-bonus cards or engineers → no final bonuses. p2: 0.
    expect(state.results).toEqual([
      { playerId: 'p1', base: 30, endBonus: 0, majority: 0, total: 30 },
      { playerId: 'p2', base: 0, endBonus: 0, majority: 0, total: 0 },
    ]);
    expect(state.winnerIds).toEqual(['p1']);
    expect(state.log.at(-1)).toMatchObject({ type: 'PASS', payload: { closedRound: 6, gameEnded: true } });
  });

  it('ends in a shared result when scores are level (all wood → all 0)', () => {
    let state = noPassPoints(newGame(2));
    for (let r = 0; r < state.rounds; r += 1) state = passRound(state);
    expect(state.status).toBe('ended');
    if (state.status !== 'ended') throw new Error('unreachable');
    expect([...state.winnerIds].sort()).toEqual(['p1', 'p2']);
    expect(state.results).toEqual([
      { playerId: 'p1', base: 0, endBonus: 0, majority: 0, total: 0 },
      { playerId: 'p2', base: 0, endBonus: 0, majority: 0, total: 0 },
    ]);
    // No further moves once ended.
    expect(() => applyAction(state, 'p1', { type: 'PASS' })).toThrowError();
  });
});
