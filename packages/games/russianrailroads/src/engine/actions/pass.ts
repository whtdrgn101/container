import type { RussianRailroadsState } from '../core';
import { allPassed, closeRound, nextActiveSeat, record, seatOf, withPlayer } from '../internal';

/**
 * Pass (pg. 7): end your participation for the round. A pass is **terminal for the round** — you take no
 * more turns until it ends. When the pass makes *every* seat passed, the round closes (`closeRound`): the
 * per-round scoring stub runs, workers/coins return and pass flags clear, the engineer strip slides right,
 * and the game either opens the next round or (after the last round) ends into the stub result (pg. 21–22).
 *
 * The pass-scoring detail — a pass scores the reverse of your turn-order card and reorders the track — is
 * RR6; RR1 keeps the dealt turn order for the whole game. Never mutates the input.
 */
export function pass(state: RussianRailroadsState, playerId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const passedRoster = withPlayer(state, seat, { ...state.players[seat]!, passed: true });
  const passedState: RussianRailroadsState = { ...state, players: passedRoster };

  if (allPassed(passedState)) {
    const { changes, scores } = closeRound(passedState);
    const ended = changes.status === 'ended';
    return record(state, 'PASS', playerId, changes, {
      closedRound: state.round,
      // The round's scoring is public (pg. 20–21 is open information) — the feed narrates it from here.
      scores,
      ...(ended ? { gameEnded: true } : { nextRound: state.round + 1 }),
    });
  }

  return record(state, 'PASS', playerId, {
    players: passedRoster,
    activePlayerIndex: nextActiveSeat(passedState)!,
  });
}
