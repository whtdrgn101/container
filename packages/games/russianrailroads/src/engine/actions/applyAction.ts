import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { flipLoco, placeLoco, replaceLoco } from './locomotive';
import { moveTrack } from './moveTrack';
import { pass } from './pass';
import { place } from './place';

/** The three loco-resolution actions, allowed only while a `pendingLoco` lock is set (pg. 10–11). */
function isLocoResolution(type: Action['type']): boolean {
  return type === 'PLACE_LOCO' || type === 'REPLACE_LOCO' || type === 'FLIP_LOCO';
}

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (RR4).
 *
 * Enforces game-over, turn-order (pg. 7), and the **two engine locks** (mutually exclusive — a turn holds at
 * most one):
 *  - the **pending-moves lock** (pg. 8–9): while a track-extension lock is set, only `MOVE_TRACK` is allowed
 *    (`MOVES_PENDING`); a `MOVE_TRACK` with no lock is refused (`NO_PENDING_MOVES`);
 *  - the **pending-loco lock** (pg. 10–11): while a locomotive is held, only the loco-resolution actions are
 *    allowed (`LOCO_PENDING`); a loco-resolution action with no lock is refused (`NO_PENDING_LOCO`).
 *
 * A passed seat is never the active seat, and a lock always belongs to the active seat, so each mechanic
 * only ever runs for the seat on the clock. Never mutates the input; throws a typed `GameError`.
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
    if (action.type !== 'MOVE_TRACK') {
      throw new GameError('MOVES_PENDING', 'Finish resolving your track moves first');
    }
  } else if (state.pendingLoco) {
    if (!isLocoResolution(action.type)) {
      throw new GameError('LOCO_PENDING', 'Finish placing your locomotive first');
    }
  } else {
    if (action.type === 'MOVE_TRACK') {
      throw new GameError('NO_PENDING_MOVES', 'No track moves are pending');
    }
    if (isLocoResolution(action.type)) {
      throw new GameError('NO_PENDING_LOCO', 'No locomotive is pending placement');
    }
  }

  switch (action.type) {
    case 'PLACE':
      return place(state, playerId, action.space, action.coins ?? 0);
    case 'MOVE_TRACK':
      return moveTrack(state, playerId, action.route, action.color);
    case 'PLACE_LOCO':
      return placeLoco(state, playerId, action.route);
    case 'REPLACE_LOCO':
      return replaceLoco(state, playerId, action.route, action.number);
    case 'FLIP_LOCO':
      return flipLoco(state, playerId);
    case 'PASS':
      return pass(state, playerId);
  }
}
