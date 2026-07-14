import { ACTIONS_PER_TURN, GameError } from '../core';
import type { GameState } from '../core';
import { record, seatOf } from '../internal';

/**
 * End the active player's turn: advance to the next seat and refill their actions.
 * (Start-of-turn steps like loan interest and Bank auctions arrive in later slices.)
 */
export function endTurn(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }
  return record(state, state.players, 'END_TURN', playerId, {
    activePlayerIndex: (state.activePlayerIndex + 1) % state.players.length,
    actionsRemaining: ACTIONS_PER_TURN,
    turn: state.turn + 1,
  });
}
