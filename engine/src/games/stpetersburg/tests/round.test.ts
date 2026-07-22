import { describe, expect, it } from 'vitest';
import { applyAction } from '../actions';
import type { StPetersburgState } from '../core';
import { createGame } from '../createGame';

/** Pass as whichever seat is on the clock until the current phase closes (advancing the phase or round). */
function passOutPhase(g: StPetersburgState): StPetersburgState {
  const round = g.round;
  const phase = g.phase;
  while (g.round === round && g.phase === phase) {
    g = applyAction(g, g.players[g.activePlayerIndex]!.id, { type: 'PASS' });
  }
  return g;
}

/** Pass every remaining phase of the current round out, stopping once the round rolls over. */
function passOutRound(g: StPetersburgState): StPetersburgState {
  const round = g.round;
  while (g.round === round) g = passOutPhase(g);
  return g;
}

/**
 * The full round loop over 2+ rounds (roadmap SP2) — the honest multi-round proof. A deterministic (no-rng)
 * 4-player game so all four starting-player markers are distinct and their rotation is observable.
 */
describe('the round loop (pg. 5), driven through applyAction', () => {
  it('loops two full rounds — slide/discard arithmetic, marker rotation (all four), exact round-2/3 entry', () => {
    let g = createGame({ id: 'g', players: ['A', 'B', 'C', 'D'].map((name) => ({ name })) });
    // Deterministic marker deal (4p: one each, in phase order).
    expect(g.startingPlayers).toEqual({ worker: 0, building: 1, aristocrat: 2, trading: 3 });
    const round1Upper = g.board.upper;
    expect(round1Upper).toHaveLength(8); // 4-player worker seed

    // ── Round 1: everyone passes every phase. No card is ever taken, so the pg. 8 special case fires all
    //    round — no mid-round refill, and no worker deal at the round transition.
    g = passOutRound(g);

    // Entering round 2, exactly:
    expect(g.round).toBe(2);
    expect(g.phase).toBe('worker');
    expect(g.startingPlayers).toEqual({ worker: 1, building: 2, aristocrat: 3, trading: 0 }); // every marker +1 (left)
    expect(g.activePlayerIndex).toBe(1); // the new worker phase's starting player is up
    expect(g.consecutivePasses).toBe(0);
    expect(g.tookCardThisPhase).toBe(false);
    expect(g.board.discard).toBe(0); // round-1 lower row was empty → nothing discarded
    expect(g.board.upper).toHaveLength(0); // special case: no workers dealt
    expect(g.board.lower).toEqual(round1Upper); // the 8 seeded workers slid down intact

    // ── Round 2: the worker starter buys a worker from the lower row (a card is taken → refills resume),
    //    then everyone passes the rest of the round out.
    const starter = g.players[g.activePlayerIndex]!.id;
    g = applyAction(g, starter, { type: 'BUY', row: 'lower', index: 0 });
    expect(g.tookCardThisPhase).toBe(true);
    expect(g.board.lower).toHaveLength(7); // 8 − 1 bought

    g = passOutRound(g);

    // Entering round 3, exactly. The round-2 worker close refilled the board to 8 (7 lower + 1 building in
    // the upper row); building/aristocrat/trading saw no buys, so the pg. 8 case skipped those refills. At
    // the transition the 7-card lower row is discarded and the lone building slides down.
    expect(g.round).toBe(3);
    expect(g.phase).toBe('worker');
    expect(g.startingPlayers).toEqual({ worker: 2, building: 3, aristocrat: 0, trading: 1 }); // +1 again
    expect(g.activePlayerIndex).toBe(2);
    expect(g.board.discard).toBe(7); // the 7 workers left in the lower row are discarded
    expect(g.board.lower).toHaveLength(1); // the single refilled building slid down
    expect(g.board.lower[0]!.kind).toBe('building');
    expect(g.board.upper).toHaveLength(0); // no card taken during round-2 trading → no worker deal
  });
});
