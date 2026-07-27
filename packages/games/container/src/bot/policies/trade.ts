import { SHIP_CAPACITY } from '../../engine';
import type { Action } from '../../engine';
import type { Candidate, Ctx } from '../types';
import { RESALE_PER_CONTAINER } from '../valuation';
import { affordableContainers, harborAskingPrice } from './pricing';

const totalPrice = (containers: readonly { price: number }[]): number =>
  containers.reduce((sum, container) => sum + container.price, 0);

/**
 * Factory Purchase: truck an opponent's factory stock into your harbor to resell to ships.
 *
 * This is the middleman move, so it only pays when the bot can buy below its own harbor asking
 * price — otherwise it is moving containers for a loss and filling harbor space it needs.
 */
export function rankFactoryPurchase(ctx: Ctx, action: Extract<Action, { type: 'FACTORY_PURCHASE' }>): Candidate | null {
  const seller = ctx.view.players.find((player) => player.id === action.sellerId);
  if (!seller) {
    return null;
  }
  const room = ctx.me.harborLimit - ctx.me.harborStore.length;
  const resale = harborAskingPrice(ctx);
  const worthBuying = seller.factoryStore.filter((container) => container.price < resale);
  const bought = affordableContainers(worthBuying, ctx.me.money, room);
  if (bought.length === 0) {
    return null;
  }
  const margin = bought.length * resale - totalPrice(bought);
  return { action: { ...action, bought }, score: 22 + margin };
}

/**
 * Harbor Purchase: load an opponent's harbor stock onto the docked ship.
 *
 * Cargo isn't bought to keep — delivering it hands the containers to the auction's high bidder and
 * pays the deliverer the winning bid plus a matching subsidy. So the trade is `cost` now against what
 * the hold will fetch later, and the bot only loads what it can resell at a profit.
 *
 * Deliberately valued with the flat `RESALE_PER_CONTAINER` rather than the (more accurate) marginal
 * estimate: a lone container is its own discard and prices at $0, so a marginal rule would refuse to
 * ever start a hold. See the note on `RESALE_PER_CONTAINER`.
 */
export function rankHarborPurchase(ctx: Ctx): Candidate | null {
  const location = ctx.me.ship.location;
  if (location.kind !== 'harbor') {
    return null;
  }
  const seller = ctx.view.players.find((player) => player.id === location.playerId);
  if (!seller) {
    return null;
  }
  const room = SHIP_CAPACITY - ctx.me.ship.cargo.length;
  const worthBuying = seller.harborStore.filter((container) => container.price <= RESALE_PER_CONTAINER);
  const bought = affordableContainers(worthBuying, ctx.me.money, room);
  if (bought.length === 0) {
    return null;
  }
  const margin = bought.length * RESALE_PER_CONTAINER - totalPrice(bought);
  return { action: { type: 'HARBOR_PURCHASE', bought }, score: 58 + margin };
}
