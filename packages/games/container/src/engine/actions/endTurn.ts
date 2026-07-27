import { GameError } from '../core';
import type { GameState } from '../core';
import { record, seatOf } from '../internal';
import { advanceTurn } from './loans';

/**
 * End the active player's turn: advance to the next seat, refill actions, and settle the incoming
 * player's start-of-turn loan interest (rulebook turn step 1).
 */
export function endTurn(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }
  const { players, extra } = advanceTurn(state, state.players);
  return record(state, players, 'END_TURN', playerId, extra);
}
