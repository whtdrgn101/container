import { GameError } from '../core';
import type { RussianRailroadsState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { pass } from './pass';
import { place } from './place';

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (RR1).
 *
 * Enforces the game-over and turn-order rules (pg. 7: players act in turn order until all have passed),
 * then dispatches to the pure mechanic. A passed seat is never the active seat (turn advancement skips
 * them), so `PLACE`/`PASS` only ever run for the seat legitimately on the clock. Never mutates the input;
 * throws a typed `GameError`.
 */
export function applyAction(state: RussianRailroadsState, playerId: string, action: Action): RussianRailroadsState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  // `seatOf` throws PLAYER_NOT_FOUND for an unknown id.
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  switch (action.type) {
    case 'PLACE':
      return place(state, playerId, action.space, action.coins ?? 0);
    case 'PASS':
      return pass(state, playerId);
  }
}
