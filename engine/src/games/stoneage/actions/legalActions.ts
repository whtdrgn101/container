import type { StoneAgeState } from '../core';
import { activePlayer, legalPlacements } from '../internal';
import type { Action } from './action';

/**
 * The actions a seat may take right now. During the placement phase this is every legal `PLACE` for the
 * active player (one per place/count); in the other phases it's empty until those stages land.
 * `playerId` defaults to the active player; an off-turn seat gets nothing.
 */
export function legalActions(state: StoneAgeState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];
  const active = activePlayer(state);
  if (playerId !== undefined && playerId !== active.id) return [];

  if (state.phase === 'placement') {
    return legalPlacements(state, active.id);
  }
  return [];
}
