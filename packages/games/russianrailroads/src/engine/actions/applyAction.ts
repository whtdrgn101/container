import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { placeFactory, replaceFactory } from './factory';
import { flipLoco, placeLoco, replaceLoco } from './locomotive';
import { moveTrack } from './moveTrack';
import { pass } from './pass';
import { place } from './place';
import { resolvePool, skipPool } from './pool';

/** The three loco-resolution actions, allowed only while a `pendingLoco` lock is set (pg. 10–11). */
function isLocoResolution(type: Action['type']): boolean {
  return type === 'PLACE_LOCO' || type === 'REPLACE_LOCO' || type === 'FLIP_LOCO';
}

/** The two factory-resolution actions, allowed only while a `pendingFactory` lock is set (pg. 12–13). */
function isFactoryResolution(type: Action['type']): boolean {
  return type === 'PLACE_FACTORY' || type === 'REPLACE_FACTORY';
}

/** The two pool-resolution actions, allowed only while the active seat holds pool credits (pg. 7, 13). */
function isPoolResolution(type: Action['type']): boolean {
  return type === 'RESOLVE_POOL' || type === 'SKIP_POOL';
}

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (RR5).
 *
 * Enforces game-over, turn-order (pg. 7), and the engine **locks** (mutually exclusive; checked in strict
 * precedence — a turn resolves one thing at a time):
 *  - **pending-moves** (pg. 8–9): only `MOVE_TRACK` (`MOVES_PENDING`);
 *  - **pending-loco** (pg. 10–11): only the loco resolutions (`LOCO_PENDING`);
 *  - **pending-factory** (pg. 12–13): only the factory resolutions (`FACTORY_PENDING`);
 *  - a non-empty **action pool** (pg. 13): only `RESOLVE_POOL` / `SKIP_POOL` (`POOL_PENDING`).
 *
 * With no lock set, the resolution actions are refused (`NO_PENDING_*`). A passed seat is never the active
 * seat and a lock/pool always belongs to the active seat, so each mechanic only runs for the seat on the
 * clock. Never mutates the input; throws a typed `GameError`.
 */
export function applyAction(state: RussianRailroadsState, playerId: string, action: Action): RussianRailroadsState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  // `seatOf` throws PLAYER_NOT_FOUND for an unknown id.
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  if (state.pendingMoves) {
    if (action.type !== 'MOVE_TRACK') throw new GameError('MOVES_PENDING', 'Finish resolving your track moves first');
  } else if (state.pendingLoco) {
    if (!isLocoResolution(action.type)) throw new GameError('LOCO_PENDING', 'Finish placing your locomotive first');
  } else if (state.pendingFactory) {
    if (!isFactoryResolution(action.type)) throw new GameError('FACTORY_PENDING', 'Finish building your factory first');
  } else if (state.players[state.activePlayerIndex]!.actionPool.length > 0) {
    if (!isPoolResolution(action.type)) throw new GameError('POOL_PENDING', 'Resolve or skip your factory actions first');
  } else {
    if (action.type === 'MOVE_TRACK') throw new GameError('NO_PENDING_MOVES', 'No track moves are pending');
    if (isLocoResolution(action.type)) throw new GameError('NO_PENDING_LOCO', 'No locomotive is pending placement');
    if (isFactoryResolution(action.type)) throw new GameError('NO_PENDING_FACTORY', 'No factory is pending placement');
    if (isPoolResolution(action.type)) throw new GameError('NO_PENDING_POOL', 'No pool actions are pending');
  }

  switch (action.type) {
    case 'PLACE':
      return place(state, playerId, action.space, action.coins ?? 0, action.build ?? 'loco', action.first ?? 'loco');
    case 'MOVE_TRACK':
      return moveTrack(state, playerId, action.route, action.color);
    case 'PLACE_LOCO':
      return placeLoco(state, playerId, action.route);
    case 'REPLACE_LOCO':
      return replaceLoco(state, playerId, action.route, action.number);
    case 'FLIP_LOCO':
      return flipLoco(state, playerId);
    case 'PLACE_FACTORY':
      return placeFactory(state, playerId, action.from);
    case 'REPLACE_FACTORY':
      return replaceFactory(state, playerId, action.slot, action.from);
    case 'RESOLVE_POOL':
      return resolvePool(state, playerId, action.id);
    case 'SKIP_POOL':
      return skipPool(state, playerId);
    case 'PASS':
      return pass(state, playerId);
  }
}
