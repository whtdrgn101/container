import { GameError } from '../core';
import type { StoneAgeState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';

/**
 * Apply an action for `playerId`. The **scaffold refuses every move** — each action is implemented in
 * its own roadmap stage. It still validates turn ownership and player existence, so the pipeline
 * (and its error mapping) is real from day one; only the mechanics are stubbed.
 */
export function applyAction(state: StoneAgeState, playerId: string, _action: Action): StoneAgeState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  // Resolves the seat (throws PLAYER_NOT_FOUND for an unknown id) before refusing — the same shape
  // the real actions will have.
  seatOf(state, playerId);
  throw new GameError('NOT_IMPLEMENTED', 'Stone Age actions are not implemented yet (see the roadmap)');
}
