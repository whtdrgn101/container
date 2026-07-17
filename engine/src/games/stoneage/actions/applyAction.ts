import { GameError } from '../core';
import type { StoneAgeState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { gather } from './gather';
import { place } from './place';

/**
 * Apply an action for `playerId`, enforcing turn order and the current phase. Throws GameError on any
 * illegal action; never mutates the input. The single entry point for a move.
 *
 * Only `PLACE` exists so far (roadmap SA1); the per-place actions, feeding, buildings and cards each
 * arrive in their own stage and add a case here.
 */
export function applyAction(state: StoneAgeState, playerId: string, action: Action): StoneAgeState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  switch (action.type) {
    case 'PLACE':
      if (state.phase !== 'placement') {
        throw new GameError('WRONG_PHASE', 'People can only be placed during the placement phase');
      }
      return place(state, playerId, action.place, action.count);
    case 'GATHER':
      if (state.phase !== 'actions') {
        throw new GameError('WRONG_PHASE', 'Resources are only gathered during the action phase');
      }
      return gather(state, playerId, action.place, action.dice);
  }
}
