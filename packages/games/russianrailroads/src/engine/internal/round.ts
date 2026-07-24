import type { Engineer, RussianRailroadsPlayer, RussianRailroadsResult, RussianRailroadsState } from '../core';
import { scorePlayer } from './scoring';
import type { RoundScore } from './scoring';

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
 * them to the box" (RR1 never claims one, so it is always dropped) — and the left-most slot becomes empty
 * (it "will show a number … the rounds remaining"). Same length; returns the new slots.
 */
export function slideEngineerStrip(strip: readonly (Engineer | null)[]): (Engineer | null)[] {
  return [null, ...strip.slice(0, -1)];
}

/**
 * The "after the scoring phase" cleanup shared by every round end (pg. 21): return all workers from
 * action spaces to their personal supplies (RR1 has no temporary workers, so every worker returns — the
 * supply goes back to full) and clear each seat's pass flag. Coins on spaces went to the general supply
 * when placed, and held coins carry over (pg. 14), so `coins` is untouched. Returns the reset roster.
 */
function resetPlayers(players: readonly RussianRailroadsPlayer[]): RussianRailroadsPlayer[] {
  return players.map((p) => ({ ...p, workersAvailable: p.workersTotal, passed: false }));
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

  if (state.round >= state.rounds) {
    const results: RussianRailroadsResult[] = players.map((p) => ({ playerId: p.id, total: p.score }));
    const top = Math.max(...players.map((p) => p.score));
    const winnerIds = players.filter((p) => p.score === top).map((p) => p.id);
    return {
      changes: { players, actionSpaces: {}, engineerStrip, pendingMoves: null, status: 'ended', results, winnerIds },
      scores,
    };
  }

  return {
    changes: {
      players,
      actionSpaces: {},
      engineerStrip,
      pendingMoves: null,
      round: state.round + 1,
      activePlayerIndex: state.turnOrder[0]!,
    },
    scores,
  };
}
