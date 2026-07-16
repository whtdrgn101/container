import type { GameView } from '@container/engine';
import { BotError } from './errors';
import type { Ctx } from './types';
import { BID_SHADING, gainFrom, selfOf } from './valuation';

/**
 * This bot's sealed bid on the active player's delivery (rulebook pg. 15–16).
 *
 * `view` must be the *bidder's* view — the bid is a function of the bidder's secret card, so every
 * bidder must be asked separately. Cargo is public (ships are open), so no hidden info is needed
 * beyond the bot's own card.
 *
 * Bidding your full valuation wins the containers but nets you nothing, so shade below it: the gap
 * is the profit. $0 is a legal bluff and falls out naturally when the cargo is worthless to you.
 */
export function bidFor(view: GameView, bidderId: string): number {
  const me = selfOf(view, bidderId);
  const deliverer = view.players[view.activePlayerIndex];
  if (!deliverer) {
    throw new BotError(`Game "${view.id}" has no active player to bid against`);
  }
  if (deliverer.id === bidderId) {
    throw new BotError(`Bot seat "${bidderId}" is the deliverer and does not bid in its own auction`);
  }
  const cargo = deliverer.ship.cargo;
  if (cargo.length === 0) {
    throw new BotError(`Player "${deliverer.id}" has no cargo — no delivery auction is open`);
  }

  const value = gainFrom(me, cargo);
  return Math.max(0, Math.min(Math.floor(value * BID_SHADING), me.money));
}

/**
 * Should the deliverer buy their own cargo out (rulebook pg. 16)?
 *
 * Buyout: pay the winning bid to the Bank and keep the containers, forfeiting the subsidy.
 * Otherwise: hand the containers to the high bidder and collect the bid *plus* a matching subsidy.
 * So it's worth buying out only when the cargo is worth more than three times the bid to you —
 * you give up `2 × bid` of income *and* spend `bid` to keep it.
 */
export function wantsBuyout(ctx: Ctx, winningBid: number): boolean {
  if (ctx.me.money < winningBid) {
    return false;
  }
  const keepingCargo = gainFrom(ctx.me, ctx.me.ship.cargo) - winningBid;
  const sellingCargo = 2 * winningBid;
  return keepingCargo > sellingCargo;
}
