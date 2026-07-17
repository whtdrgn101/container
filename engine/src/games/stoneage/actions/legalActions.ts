import type { StoneAgeState } from '../core';
import { activePlayer, legalPlacements, legalUses } from '../internal';
import type { Action } from './action';

/**
 * The actions a seat may take right now: every legal `PLACE` in the placement phase, the `USE` actions
 * in the action phase, and `FEED` in the feeding phase. `playerId` defaults to the active player; an
 * off-turn seat gets nothing.
 */
export function legalActions(state: StoneAgeState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];
  const active = activePlayer(state);
  if (playerId !== undefined && playerId !== active.id) return [];

  if (state.phase === 'placement') {
    return legalPlacements(state, active.id);
  }
  if (state.phase === 'actions') {
    // The `USE` actions (tool maker/hut/field); the dice gathers are server-only, offered by the route.
    return legalUses(state, active.id);
  }
  // Feeding: the active feeder simply feeds (whether to spend resources is the action's own parameter).
  return [{ type: 'FEED' }];
}
