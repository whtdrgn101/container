import { GameError } from '../core';
import type { StoneAgeState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { build } from './build';
import { feed } from './feed';
import { gather } from './gather';
import { place } from './place';
import { takeGather } from './take';
import { use } from './use';

/**
 * Apply an action for `playerId`, enforcing turn order and the current phase. Throws GameError on any
 * illegal action; never mutates the input. The single entry point for a move.
 *
 * A full round is now playable: `PLACE` (SA1) → `GATHER`/`USE` (SA2–6) → `FEED` (SA7), which rolls into
 * the next round (SA8). Buildings and cards each still arrive in their own stage and add a case here.
 */
export function applyAction(state: StoneAgeState, playerId: string, action: Action): StoneAgeState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }
  // A rolled-but-not-taken gather locks the turn: you must take it (optionally with tools) first.
  if (state.pendingGather && action.type !== 'TAKE_GATHER') {
    throw new GameError('GATHER_PENDING', 'Take your dice roll before doing anything else');
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
    case 'TAKE_GATHER':
      return takeGather(state, playerId, action.toolIndices);
    case 'USE':
      if (state.phase !== 'actions') {
        throw new GameError('WRONG_PHASE', 'Places are only used during the action phase');
      }
      return use(state, playerId, action.place);
    case 'BUILD':
      if (state.phase !== 'actions') {
        throw new GameError('WRONG_PHASE', 'Buildings are only bought during the action phase');
      }
      return build(state, playerId, action.stack, action.resources);
    case 'FEED':
      if (state.phase !== 'feeding') {
        throw new GameError('WRONG_PHASE', 'People are only fed during the feeding phase');
      }
      return feed(state, playerId, action.payWithResources);
  }
}
