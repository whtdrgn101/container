import { GameError } from '../core';
import type { StPetersburgState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { addToHand } from './addToHand';
import { buy } from './buy';
import { observatoryDraw, observatoryResolve } from './observatory';
import { pass } from './pass';
import { playFromHand } from './playFromHand';
import { pubBuy } from './pubBuy';

/**
 * Apply an action for `playerId` — the single, turn-aware entry point for a move (roadmap SP1).
 *
 * The full action set is playable across the round loop: `BUY` a card / `ADD_TO_HAND` (free) /
 * `PLAY_FROM_HAND` (SP3) / `PASS`, in turn order from the phase's starting player, with a phase's actions
 * ending on all-pass-consecutively (then scoring + refill + phase advance for scoring phases, or the round
 * transition when the trading phase closes — both inside the closing `pass`). Trading-card buys/plays carry
 * a displacement target (SP4); the Pub/Observatory interludes are engine-level turn locks (SP5).
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
  // Engine-level turn locks (like Stone Age's `pendingGather`): while an SP5 interlude is open, the seat on
  // the clock may only resolve *it* — every other move is refused cleanly (pg. 8). These ARE rules, so they
  // live here, not behind the backend `pendingStep` coordination hook.
  if (state.pendingDraw && action.type !== 'OBSERVATORY_RESOLVE') {
    throw new GameError('DRAW_PENDING', 'Resolve your Observatory draw before doing anything else');
  }
  if (state.pendingPubBuy && action.type !== 'PUB_BUY') {
    throw new GameError('PUB_PENDING', 'The Pub buy-points window must be resolved first');
  }

  switch (action.type) {
    case 'BUY':
      return buy(state, playerId, action.row, action.index, action.displace);
    case 'ADD_TO_HAND':
      return addToHand(state, playerId, action.row, action.index);
    case 'PLAY_FROM_HAND':
      return playFromHand(state, playerId, action.index, action.displace);
    case 'PASS':
      return pass(state, playerId);
    case 'PUB_BUY':
      return pubBuy(state, playerId, action.points);
    case 'OBSERVATORY_DRAW':
      return observatoryDraw(state, playerId, action.stack);
    case 'OBSERVATORY_RESOLVE':
      return observatoryResolve(state, playerId, action.choice, action.displace);
  }
}
