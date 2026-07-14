import { GameError } from '../core';
import type { GameState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { buildFactory, buildWarehouse } from './build';
import { endTurn } from './endTurn';
import { produce } from './produce';
import { reprice } from './reprice';

/**
 * Apply an action for `playerId`, enforcing turn order and the per-turn action budget.
 * PRODUCE / BUILD_* / REPRICE each cost one action; END_TURN ends the turn. Throws GameError on any
 * illegal action; never mutates the input state. This is the single entry point for making a move.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  const seat = seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  if (action.type === 'END_TURN') {
    return endTurn(state, playerId);
  }

  if (state.actionsRemaining <= 0) {
    throw new GameError('NO_ACTIONS_REMAINING', `Player "${playerId}" has no actions left this turn`);
  }

  const apply = (): GameState => {
    switch (action.type) {
      case 'PRODUCE':
        return produce(state, playerId, action.placements);
      case 'BUILD_FACTORY':
        return buildFactory(state, playerId, action.color);
      case 'BUILD_WAREHOUSE':
        return buildWarehouse(state, playerId);
      case 'REPRICE':
        if (action.arrangement === undefined) {
          throw new GameError('INVALID_SELECTION', 'REPRICE requires an arrangement');
        }
        return reprice(state, playerId, action.district, action.arrangement);
    }
  };

  const next = apply();
  return { ...next, actionsRemaining: next.actionsRemaining - 1 };
}
