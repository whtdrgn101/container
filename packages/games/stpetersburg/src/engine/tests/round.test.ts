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

    // ── Round 1: everyone passes every phase. No card is ever taken, so the pg. 8 special case skips every
    //    mid-round refill. The round-end worker deal (pg. 5) runs unconditionally, but adds nothing here —
    //    the 8 seeded workers slid down to the lower row already fill the board to 8.
    g = passOutRound(g);

    // Entering round 2, exactly:
    expect(g.round).toBe(2);
    expect(g.phase).toBe('worker');
    expect(g.startingPlayers).toEqual({ worker: 1, building: 2, aristocrat: 3, trading: 0 }); // every marker +1 (left)
    expect(g.activePlayerIndex).toBe(1); // the new worker phase's starting player is up
    expect(g.consecutivePasses).toBe(0);
    expect(g.tookCardThisPhase).toBe(false);
    expect(g.board.discard).toBe(0); // round-1 lower row was empty → nothing discarded
    expect(g.board.upper).toHaveLength(0); // board already holds 8 (all slid into the lower row) → deal 0
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
    // the transition the 7-card lower row is discarded and the lone building slides down, then workers are
    // dealt back to 8 (pg. 5, unconditional): 1 building on the board + 7 fresh workers.
    expect(g.round).toBe(3);
    expect(g.phase).toBe('worker');
    expect(g.startingPlayers).toEqual({ worker: 2, building: 3, aristocrat: 0, trading: 1 }); // +1 again
    expect(g.activePlayerIndex).toBe(2);
    expect(g.board.discard).toBe(7); // the 7 workers left in the lower row are discarded
    expect(g.board.lower).toHaveLength(1); // the single refilled building slid down
    expect(g.board.lower[0]!.kind).toBe('building');
    expect(g.board.upper).toHaveLength(7); // pg. 5: workers dealt back to 8 total (1 lower + 7 upper)
    expect(g.board.upper.every((c) => c.kind === 'worker')).toBe(true);
  });

  it('deals workers at every rollover even when no card is ever taken — the board-drain-spiral fix (pg. 5 vs pg. 8)', () => {
    // Reproduces a live play-test bug (folded into SP3). SP2 gated the round-end worker deal on
    // `tookCardThisPhase`; with every phase card-less (all-pass), each rollover discarded the lower row
    // but dealt no workers, so the board drained to empty and never recovered. The fix: pg. 5's round-end
    // worker deal is UNCONDITIONAL (the new round's setup); pg. 8's special case gates only the mid-round
    // phase refills (`scoreAndRefill`). (ADD_TO_HAND — this slice — also makes trading-phase takes
    // possible, but the unconditional round deal is the load-bearing fix.) A 2-player game (seed 4) makes
    // the deal fire at the very first rollover, since the board starts below 8.
    let g = createGame({ id: 'g', players: ['A', 'B'].map((name) => ({ name })) });
    expect(g.board.upper).toHaveLength(4); // 2-player worker seed
    const workerStack0 = g.board.stacks.worker.length;

    // Round 1, all-pass → round 2. Mid-round refills all skip (pg. 8: nothing taken), but the round-end
    // deal tops the board back up to 8 (4 slid workers + 4 freshly dealt).
    g = passOutRound(g);
    expect(g.round).toBe(2);
    expect(g.board.lower).toHaveLength(4);
    expect(g.board.upper).toHaveLength(4); // workers dealt back after the slide (the fix)
    expect(g.board.upper.every((c) => c.kind === 'worker')).toBe(true);
    expect(g.board.stacks.worker).toHaveLength(workerStack0 - 4); // 4 workers were dealt at the rollover
    // pg. 8 still gates mid-round phase refills — nothing taken, so no building/aristocrat cards dealt.
    expect(g.board.stacks.building).toHaveLength(28);
    expect(g.board.stacks.aristocrat).toHaveLength(27);

    // Round 2, all-pass → round 3. Under the old gated behaviour the board drained to EMPTY here (the
    // slid workers discarded, no deal); now it is re-dealt to 8 again.
    g = passOutRound(g);
    expect(g.round).toBe(3);
    expect(g.board.discard).toBe(4); // round-1's 4 slid workers were discarded
    expect(g.board.upper).toHaveLength(4); // NOT 0 — the board never drains below the worker deal
    expect(g.board.upper.every((c) => c.kind === 'worker')).toBe(true);
    expect(g.board.stacks.building).toHaveLength(28); // pg. 8 still holds — no phase refill ever ran
  });
});
