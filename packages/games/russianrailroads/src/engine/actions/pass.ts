import { passPoints } from '../core';
import type { RussianRailroadsState } from '../core';
import { allPassed, closeRound, nextActiveSeat, record, seatOf, withPlayer } from '../internal';

/**
 * Pass (pg. 7, 16): end your participation for the round. A pass is **terminal for the round** — you take no
 * more turns until it ends. Passing immediately **flips your turn-order card and scores its reverse** (pg.
 * 16, `passPoints`), added to your cumulative score. When the pass makes *every* seat passed, the round
 * closes (`closeRound`): the scoring phase runs, workers return and pass flags clear, the engineer strip
 * slides right, the **turn-order track is rearranged** (pg. 16–17), and the game opens the next round (or,
 * after the last round, ends). Never mutates the input.
 */
export function pass(state: RussianRailroadsState, playerId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  // Flip the turn-order card and score its reverse (pg. 16) — a fixed per-round bonus for later seats.
  const gainedPass = passPoints(player.turnOrderCard);
  const passedRoster = withPlayer(state, seat, { ...player, passed: true, score: player.score + gainedPass });
  const passedState: RussianRailroadsState = { ...state, players: passedRoster };

  if (allPassed(passedState)) {
    const { changes, scores } = closeRound(passedState);
    const ended = changes.status === 'ended';
    // On the final round's close, the per-player final-scoring breakdown (pg. 22) is public — the feed
    // narrates it. `changes.results` is present exactly on the ended arm of the end-state union.
    const finalScores = changes.status === 'ended' ? changes.results : undefined;
    return record(state, 'PASS', playerId, changes, {
      closedRound: state.round,
      passScore: gainedPass,
      // The round's scoring is public (pg. 20–21 is open information) — the feed narrates it from here.
      scores,
      ...(ended ? { gameEnded: true, finalScores } : { nextRound: state.round + 1 }),
    });
  }

  return record(
    state,
    'PASS',
    playerId,
    { players: passedRoster, activePlayerIndex: nextActiveSeat(passedState)! },
    { passScore: gainedPass },
  );
}
