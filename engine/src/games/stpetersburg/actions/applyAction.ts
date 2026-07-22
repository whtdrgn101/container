import { GameError } from '../core';
import type { StPetersburgState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { buy } from './buy';
import { pass } from './pass';

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (roadmap SP1).
 *
 * The phase spine is playable across a full round loop: `BUY` a card / `PASS`, in turn order from the
 * phase's starting player, with a phase's actions ending on all-pass-consecutively (then scoring + refill
 * + phase advance for scoring phases, or the round transition when the trading phase closes — both inside
 * the closing `pass`). `ADD_TO_HAND` / `PLAY_FROM_HAND` and trading-card buys arrive in SP3–SP4.
 *
 * Never mutates the input; throws a typed `GameError`.
 */
export function applyAction(state: StPetersburgState, playerId: string, action: Action): StPetersburgState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  // `seatOf` throws PLAYER_NOT_FOUND for an unknown id.
  if (seatOf(state, playerId) !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  switch (action.type) {
    case 'BUY':
      return buy(state, playerId, action.row, action.index);
    case 'PASS':
      return pass(state, playerId);
  }
}
