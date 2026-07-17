import { COLUMN_HEIGHTS, GameError, WIN_COLUMNS } from '../core';
import type { CantStopPlayer, CantStopState } from '../core';
import { activePlayer, record, withPlayer } from '../internal';

/** Drop a column's square from a player (bumped when someone else wins that column). */
function withoutColumn(player: CantStopPlayer, col: number): CantStopPlayer {
  const progress = { ...player.progress };
  delete progress[col];
  return { ...player, progress };
}

/**
 * Stop and bank the turn (rules "Playing" step 4): every runner becomes a permanent colored square.
 * A runner sitting on a column's top space **claims** that column, knocking any opponent's square off
 * it (rules "Winning a Column"); claiming a third column wins the game (rules "Winning"). Otherwise
 * the turn passes to the next seat. You may only stop in the `rolling` phase and only with something
 * to bank — you can't stop before you've moved.
 */
export function stop(state: CantStopState, playerId: string): CantStopState {
  if (state.phase !== 'rolling') {
    throw new GameError('WRONG_PHASE', 'Finish choosing a pairing before you stop');
  }
  const runnerColumns = Object.keys(state.runners).map(Number);
  if (runnerColumns.length === 0) {
    throw new GameError('NOTHING_TO_STOP', 'You have not advanced any runner this turn');
  }

  const seat = state.activePlayerIndex;
  const player = activePlayer(state);

  const progress: Record<number, number> = { ...player.progress };
  const newlyClaimed: number[] = [];
  for (const col of runnerColumns) {
    const height = state.runners[col]!;
    progress[col] = height;
    if (height === COLUMN_HEIGHTS[col]!) newlyClaimed.push(col);
  }

  let players = withPlayer(state, seat, { ...player, progress });
  const claimed: Record<number, string> = { ...state.claimed };
  for (const col of newlyClaimed) {
    claimed[col] = player.id;
    players = players.map((other) => (other.id === player.id ? other : withoutColumn(other, col)));
  }

  const claimCount = Object.values(claimed).filter((id) => id === player.id).length;
  // The turn ends either way, so the roll count resets (a win freezes the board; a normal stop passes).
  const banked: Partial<CantStopState> = { players, claimed, runners: {}, dice: null, phase: 'rolling', rollsThisTurn: 0 };

  if (claimCount >= WIN_COLUMNS) {
    return record(state, 'STOP', playerId, { ...banked, status: 'ended', winnerIds: [player.id] });
  }
  return record(state, 'STOP', playerId, {
    ...banked,
    activePlayerIndex: (seat + 1) % players.length,
    turn: state.turn + 1,
  });
}
