import type { StPetersburgState } from '../core';
import { finalScoring, nextSeatIndex, pubOwnerSeats, record, roundTransition, scoreAndRefill, scorePlayers } from '../internal';

/**
 * Pass (pg. 3). Always legal on your turn, and **not sticky** — a passed player may act again next turn.
 * The phase's actions end when **every player passes consecutively** (the first pass need not be the
 * starting player), tracked by `consecutivePasses`:
 *
 *  - Fewer than all players have passed in a row → just advance the turn, counting this pass.
 *  - The last player passes (counter reaches the player count) → the phase's actions are done:
 *    - **worker / building / aristocrat** → score the phase, refill the board, advance to the next phase
 *      (`scoreAndRefill`).
 *    - **trading**, and the game is **not** in its final round → no scoring (pg. 5); roll the round over
 *      (`roundTransition`): discard the lower row, slide upper → lower, refill workers, rotate the markers
 *      left, open the next round's worker phase. Logged with the round-rollover payload so the feed narrates it.
 *    - **trading**, and it **is** the final round (pg. 5, SP6) → the game ends instead of rolling over:
 *      `finalScoring` computes the per-player breakdown + winners and the state moves to the `ended` arm.
 *      A Pub interlude can never be open here — the Pub window opens and resolves entirely inside the
 *      *building* phase — so the trading close is always free to end the game (asserted in `phase.test.ts`).
 */
export function pass(state: StPetersburgState, playerId: string): StPetersburgState {
  const passes = state.consecutivePasses + 1;
  if (passes < state.players.length) {
    return record(state, 'PASS', playerId, { consecutivePasses: passes, activePlayerIndex: nextSeatIndex(state) });
  }
  if (state.phase === 'trading') {
    // pg. 5, SP6: after the final round's trading actions, the game ends into final scoring rather than
    // rolling a new round. `finalRound` was armed by the refill that placed a group's last card on the board.
    if (state.finalRound) {
      return record(state, 'PASS', playerId, finalScoring(state), { gameEnded: true, endedRound: state.round });
    }
    return record(state, 'PASS', playerId, roundTransition(state), {
      roundEnded: state.round,
      nextRound: state.round + 1,
    });
  }
  // Building phase (pg. 8, SP5): score first, then — *immediately after* building scoring — open the Pub
  // buy-points window for any Pub owners. The phase does NOT advance (no refill/next phase) until every
  // queued owner has taken a PUB_BUY; `pubBuy` runs `advanceAfterScoring` when the queue empties.
  if (state.phase === 'building') {
    const pubSeats = pubOwnerSeats(state);
    if (pubSeats.length > 0) {
      return record(state, 'PASS', playerId, {
        players: scorePlayers(state),
        pendingPubBuy: { queue: pubSeats },
        activePlayerIndex: pubSeats[0]!,
      }, { closedPhase: 'building', pubPending: true });
    }
  }
  return record(state, 'PASS', playerId, scoreAndRefill(state), { closedPhase: state.phase });
}
