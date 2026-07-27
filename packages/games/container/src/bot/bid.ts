import type { Color, GameView } from '../engine';
import { BotError } from './errors';
import type { Ctx } from './types';
import { BID_SHADING, RUNOFF_SHADING, expectedValueFor, gainFrom, selfOf } from './valuation';

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
 * How much more this bot will add in a runoff, on top of the bid it already has on the table (pg. 16).
 *
 * A runoff means your opening bid wasn't enough to win outright, so the shading that made that bid
 * profitable is now the thing losing you the cargo. The bot therefore reaches closer to its true
 * valuation here than it did opening — still under it, since winning at exactly your valuation is
 * worth no more than losing. Two bots that value the cargo identically will deadlock, which is
 * correct: that is precisely the case the rulebook hands to the deliverer to break.
 */
export function runoffBidFor(view: GameView, bidderId: string, openingBid: number): number {
  const me = selfOf(view, bidderId);
  const deliverer = view.players[view.activePlayerIndex];
  if (!deliverer) {
    throw new BotError(`Game "${view.id}" has no active player to bid against`);
  }
  const value = gainFrom(me, deliverer.ship.cargo);
  // The opening bid isn't sunk — a loser gets it back — so the ceiling is a total, not an increment.
  const ceiling = Math.min(me.money, Math.floor(value * RUNOFF_SHADING));
  return Math.max(0, ceiling - openingBid);
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

/**
 * Which tied bidder to hand the cargo to when a runoff ends level — "the player delivering
 * containers chooses which tied bidder wins" (pg. 16).
 *
 * The containers have to go to *someone*, and they're worth points to whoever gets them, so the bot
 * gives them to whoever they help least. It cannot see their cards, but their scoring areas are
 * public, so "least" is measured in expectation over the cards each could still hold.
 */
export function chooseTiedWinner(ctx: Ctx, tied: readonly string[], cargo: readonly Color[]): string {
  let choice = tied[0]!;
  let leastHelped = Infinity;
  for (const id of tied) {
    const opponent = ctx.opponents.find((player) => player.id === id);
    if (!opponent) {
      continue;
    }
    const helped = expectedValueFor(ctx, opponent, cargo);
    if (helped < leastHelped) {
      leastHelped = helped;
      choice = id;
    }
  }
  return choice;
}
