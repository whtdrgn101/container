import type { Action } from '@container/engine';
import type { Candidate, Ctx } from '../types';
import { rankCallBank } from './bank';
import {
  rankBuildFactory,
  rankBuildWarehouse,
  rankProduce,
  rankRepayLoan,
  rankReprice,
  rankRequestLoan,
} from './economy';
import { rankFactoryPurchase, rankHarborPurchase } from './trade';
import { rankLoadFromBank, rankSail } from './voyage';

/**
 * Score one legal action and fill in whatever parameters it needs, or return `null` to decline it.
 *
 * `legalActions` returns several actions as bare *markers* — PRODUCE without placements, REPRICE
 * without an arrangement, the purchases without `bought`, CALL_BANK without a bid. Those are not
 * playable as returned (`applyAction` throws on most of them), so completing them is this layer's
 * job — and completing them *is* the strategy: what to charge, how much to bid, what to buy.
 */
export function rank(ctx: Ctx, action: Action): Candidate | null {
  switch (action.type) {
    // The baseline every other action must beat. Nothing to do → end the turn.
    case 'END_TURN':
      return { action, score: 0 };
    case 'PRODUCE':
      return rankProduce(ctx);
    case 'BUILD_FACTORY':
      return rankBuildFactory(ctx, action);
    case 'BUILD_WAREHOUSE':
      return rankBuildWarehouse(ctx);
    case 'REPRICE':
      return rankReprice(ctx, action);
    case 'SAIL':
      return rankSail(ctx, action);
    case 'FACTORY_PURCHASE':
      return rankFactoryPurchase(ctx, action);
    case 'HARBOR_PURCHASE':
      return rankHarborPurchase(ctx);
    case 'REQUEST_LOAN':
      return rankRequestLoan(ctx);
    case 'REPAY_LOAN':
      return rankRepayLoan(ctx);
    case 'CALL_BANK':
      return rankCallBank(ctx, action);
    case 'LOAD_FROM_BANK':
      return rankLoadFromBank(action);
    // Not scored: a delivery is forced, and it needs bids the bot cannot see. `decide` handles it.
    case 'DELIVER':
      return null;
  }
}
