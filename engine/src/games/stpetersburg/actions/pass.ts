import type { StPetersburgState } from '../core';
import { nextSeatIndex, record, roundTransition, scoreAndRefill } from '../internal';

/**
 * Pass (pg. 3). Always legal on your turn, and **not sticky** — a passed player may act again next turn.
 * The phase's actions end when **every player passes consecutively** (the first pass need not be the
 * starting player), tracked by `consecutivePasses`:
 *
 *  - Fewer than all players have passed in a row → just advance the turn, counting this pass.
 *  - The last player passes (counter reaches the player count) → the phase's actions are done:
 *    - **worker / building / aristocrat** → score the phase, refill the board, advance to the next phase
 *      (`scoreAndRefill`).
 *    - **trading** → no scoring (pg. 5); roll the round over (`roundTransition`): discard the lower row,
 *      slide upper → lower, refill workers, rotate the markers left, and open the next round's worker
 *      phase. Logged with the round-rollover payload so the feed can narrate it.
 */
export function pass(state: StPetersburgState, playerId: string): StPetersburgState {
  const passes = state.consecutivePasses + 1;
  if (passes < state.players.length) {
    return record(state, 'PASS', playerId, { consecutivePasses: passes, activePlayerIndex: nextSeatIndex(state) });
  }
  if (state.phase === 'trading') {
    return record(state, 'PASS', playerId, roundTransition(state), {
      roundEnded: state.round,
      nextRound: state.round + 1,
    });
  }
  return record(state, 'PASS', playerId, scoreAndRefill(state), { closedPhase: state.phase });
}
