import { GameError } from '../core';
import type { GameState } from '../core';
import { seatOf } from '../internal';
import type { Action } from './action';
import { buildFactory, buildWarehouse } from './build';
import { callBank } from './callBank';
import { deliver, mustDeliver } from './deliver';
import { endTurn } from './endTurn';
import { factoryPurchase } from './factoryPurchase';
import { harborPurchase } from './harborPurchase';
import { loadHolding } from './loadHolding';
import { repayLoan, requestLoan } from './loans';
import { produce } from './produce';
import { reprice } from './reprice';
import { sail } from './sail';

/**
 * Apply an action for `playerId`, enforcing turn order and the per-turn action budget.
 * PRODUCE / BUILD_* / REPRICE each cost one action; END_TURN ends the turn. Throws GameError on any
 * illegal action; never mutates the input state. This is the single entry point for making a move.
 */
export function applyAction(state: GameState, playerId: string, action: Action): GameState {
  if (state.status === 'ended') {
    throw new GameError('GAME_OVER', 'The game has ended');
  }
  const seat = seatOf(state, playerId);

  // Requesting a Bank loan is the one action that escapes turn order entirely (rulebook pg. 16):
  // "you can request a loan ... at any time during the game. Unlike other free actions, you can do
  // this during other players' turns (even during delivery auctions)." The rulebook's own example is
  // a player taking a loan so they can afford to bid in someone else's delivery auction — so this
  // must also bypass the MUST_DELIVER gate below, not just the turn check.
  if (action.type === 'REQUEST_LOAN') {
    return requestLoan(state, playerId);
  }

  if (seat !== state.activePlayerIndex) {
    throw new GameError('NOT_YOUR_TURN', `It is not player "${playerId}"'s turn`);
  }

  // Arriving at the island with cargo forces the delivery auction before anything else.
  if (mustDeliver(state) && action.type !== 'DELIVER') {
    throw new GameError('MUST_DELIVER', 'You must resolve the delivery auction at Container Island');
  }

  if (action.type === 'END_TURN') {
    return endTurn(state, playerId);
  }

  // DELIVER is a free anchor action that ends the turn — it costs no action point.
  if (action.type === 'DELIVER') {
    if (action.bids === undefined) {
      throw new GameError('INVALID_SELECTION', "DELIVER requires the opponents' bids");
    }
    return deliver(state, playerId, {
      bids: action.bids,
      runoffBids: action.runoffBids,
      buyout: action.buyout,
      chosenWinnerId: action.chosenWinnerId,
    });
  }

  // Repaying and loading the ship at the Bank are free actions — no action point, no end of turn.
  // Unlike REQUEST_LOAN above, these are only free *on your own turn* (pg. 16: "Unlike other free
  // actions", and pg. 15: no free actions at all once a delivery auction has ended).
  if (action.type === 'REPAY_LOAN') {
    return repayLoan(state, playerId);
  }
  if (action.type === 'LOAD_FROM_BANK') {
    return loadHolding(state, playerId);
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
      case 'SAIL':
        return sail(state, playerId, action.to);
      case 'CALL_BANK':
        return callBank(
          state,
          playerId,
          action.lotIndex,
          action.lotKind ?? 'container',
          action.bid,
          action.containerBid,
        );
      case 'FACTORY_PURCHASE':
        if (action.bought === undefined) {
          throw new GameError('INVALID_SELECTION', 'FACTORY_PURCHASE requires the containers to buy');
        }
        return factoryPurchase(state, playerId, action.sellerId, action.bought);
      case 'HARBOR_PURCHASE':
        if (action.bought === undefined) {
          throw new GameError('INVALID_SELECTION', 'HARBOR_PURCHASE requires the containers to buy');
        }
        return harborPurchase(state, playerId, action.bought);
    }
  };

  const next = apply();
  return { ...next, actionsRemaining: next.actionsRemaining - 1 };
}
