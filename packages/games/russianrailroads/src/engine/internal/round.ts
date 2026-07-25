import type { Engineer, RussianRailroadsPlayer, RussianRailroadsResult, RussianRailroadsState } from '../core';
import { finalScoring } from './finalScoring';
import { scorePlayer } from './scoring';
import type { RoundScore } from './scoring';
import { rearrangeTurnOrder, reuseQueue } from './turnorder';

/**
 * The next seat to act after the current one (pg. 7): the next seat in `turnOrder` (wrapping) whose
 * player has **not** passed. Returns `null` when every seat has passed — the signal to end the round.
 *
 * A seat that just *placed* (didn't pass) is still un-passed, so with only one active player it correctly
 * returns to itself; a seat that just *passed* is skipped.
 */
export function nextActiveSeat(state: RussianRailroadsState): number | null {
  const { turnOrder, players, activePlayerIndex } = state;
  const here = turnOrder.indexOf(activePlayerIndex);
  for (let step = 1; step <= turnOrder.length; step += 1) {
    const seat = turnOrder[(here + step) % turnOrder.length]!;
    if (!players[seat]!.passed) return seat;
  }
  return null;
}

/** Are all seats passed (so the round's placement is over, pg. 7)? */
export function allPassed(state: RussianRailroadsState): boolean {
  return state.players.every((p) => p.passed);
}

/**
 * Slide the engineer strip one space to the right (pg. 21–22): every engineer moves right by one, the
 * right-most (the hiring space) falls off — "if the engineer on the hiring space was not claimed, return
 * them to the box" — and the left-most slot becomes empty (it "will show a number … the rounds remaining").
 * A **hired** engineer already left the strip (RR7's `takeHiring` emptied the hiring slot when it was
 * claimed), so the falling-off slot is a `null` and only genuinely *unclaimed* engineers reach the box.
 * Same length; returns the new slots.
 */
export function slideEngineerStrip(strip: readonly (Engineer | null)[]): (Engineer | null)[] {
  return [null, ...strip.slice(0, -1)];
}

/**
 * The "after the scoring phase" cleanup shared by every round end (pg. 21): return all workers to their
 * personal supplies (`workersAvailable` back to full) and clear each seat's pass flag. The 2 **temporary**
 * workers are returned to their action space (pg. 15) — so `tempWorkers` clears to 0 and, because the reset
 * sets `workersAvailable = workersTotal` (which excludes temp workers), any unspent temp worker vanishes
 * with it. Coins went to the general supply when placed and held coins carry over (pg. 14), and doubler
 * tiles stay on the board across rounds (pg. 14), so `coins`/`doublers` are untouched. Returns the reset
 * roster.
 */
function resetPlayers(players: readonly RussianRailroadsPlayer[]): RussianRailroadsPlayer[] {
  // `actionPool` is cleared too (pg. 7, 13: pool credits are lost at turn end) — it is only ever non-empty
  // for the seat mid-industrialization, so this is a safety net, not the normal clearing path.
  return players.map((p) => ({
    ...p,
    workersAvailable: p.workersTotal,
    tempWorkers: 0,
    passed: false,
    actionPool: [],
    // Hired engineers are usable once per round (pg. 15), so the per-round use flags reset here.
    usedEngineers: [],
  }));
}

/** What `closeRound` hands back: the state changes to fold into one `record()`, plus the scoring breakdown. */
export interface RoundClose {
  readonly changes: Partial<RussianRailroadsState>;
  /** Per-player points scored this round (pg. 20–21), for the closing move's log payload. */
  readonly scores: readonly RoundScore[];
}

/**
 * Close the round once every seat has passed (pg. 7, 20–22): run the **scoring phase**, then clean up,
 * then advance or end. Returns the changes for the closing `pass` to fold into one `record()`, plus the
 * per-player scoring breakdown for the log.
 *
 *  - **Scoring** (pg. 20–21): each player scores their three routes (loco-reach-gated, valuation-tile per
 *    space incl. empty spaces behind a track) + industry (an RR5 stub, 0), added to their cumulative
 *    `score`.
 *  - **Cleanup** (pg. 21): return workers to supplies, clear pass flags and action-space occupancy, clear
 *    any lock, slide the engineer strip right.
 *  - **Advance or end**: if this wasn't the last round, increment it and re-open placement with the round's
 *    turn-order starting seat (RR1 keeps the dealt order — the full turn-order track is RR6). If it **was**
 *    the last round (pg. 22), the game ends and `results` carry the cumulative totals; `winnerIds` are the
 *    highest scorers (ties share). **Final** scoring — end-bonus + engineer majority — lands RR8.
 */
export function closeRound(state: RussianRailroadsState): RoundClose {
  const scores = state.players.map(scorePlayer);
  const scored = state.players.map((p, i) => ({ ...p, score: p.score + scores[i]!.gained }));
  const players = resetPlayers(scored);
  const engineerStrip = slideEngineerStrip(state.engineerStrip);
  // Every lock is clear at round close (all seats have passed, so nothing was mid-resolution).
  const clearedLocks = {
    pendingMoves: null,
    pendingLoco: null,
    pendingFactory: null,
    pendingThen: null,
    pendingKey: null,
    pendingIdeaToken: null,
    pendingIdeaCard: null,
  } as const;

  if (state.round >= state.rounds) {
    // Final scoring (pg. 22): after the last round's scoring phase, add the end-bonus cards (pg. 47) and the
    // engineer majority (40/20) onto each player's cumulative total. `scored` already carries the round's
    // points, so `base` is `p.score`; the player's own `score` is bumped to the final total so the ended
    // board reads it directly. Winners are the highest totals; ties share (pg. 23).
    const results: RussianRailroadsResult[] = finalScoring(scored);
    const finalPlayers = scored.map((p, i) => ({ ...p, score: results[i]!.total }));
    const top = Math.max(...results.map((r) => r.total));
    const winnerIds = results.filter((r) => r.total === top).map((r) => r.playerId);
    return {
      changes: {
        players: finalPlayers,
        actionSpaces: {},
        engineerStrip,
        ...clearedLocks,
        status: 'ended',
        results,
        winnerIds,
      },
      scores,
    };
  }

  // Rearrange the turn-order track for next round (pg. 16–17), then reset the claims.
  const turnOrder = rearrangeTurnOrder(state.turnOrder, state.turnClaims);
  const reuse = reuseQueue(state.turnClaims);
  const common = {
    players,
    actionSpaces: {},
    engineerStrip,
    ...clearedLocks,
    turnOrder,
    turnClaims: { first: null, second: null },
    round: state.round + 1,
  };

  // The between-round worker-reuse mini-phase (pg. 17): if anyone claimed a turn-order space, open it with
  // the 2nd-place claimant on the clock. Placement for the new round opens only once the queue empties.
  if (reuse.length > 0) {
    return { changes: { ...common, pendingReuse: reuse, activePlayerIndex: reuse[0]! }, scores };
  }
  return { changes: { ...common, pendingReuse: null, activePlayerIndex: turnOrder[0]! }, scores };
}
