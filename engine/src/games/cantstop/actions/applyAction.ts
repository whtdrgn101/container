import { GameError } from '../core';
import type { CantStopState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { roll } from './roll';
import { select } from './select';
import { stop } from './stop';

/**
 * Apply an action for `playerId`, enforcing turn order. Throws GameError on any illegal action; never
 * mutates the input. The single entry point for a move — used by the client-facing SELECT/STOP as
 * well as the server-only ROLL (the roll route builds that with injected dice).
 */
export function applyAction(state: CantStopState, playerId: string, action: Action): CantStopState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }
  switch (action.type) {
    case 'ROLL':
      return roll(state, playerId, action.dice);
    case 'SELECT':
      return select(state, playerId, action.columns);
    case 'STOP':
      return stop(state, playerId);
  }
}
