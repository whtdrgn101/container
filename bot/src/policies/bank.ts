import type { Action } from '@container/engine';
import type { Candidate, Ctx } from '../types';
import { expectedAuctionBid } from '../valuation';

/**
 * Containers won at the Bank land in your holding area, not your scoring area — they still have to
 * be shipped and sold before they're worth anything. This discount prices that extra work in.
 */
const HOLDING_DISCOUNT = 0.7;

/** Container lot: bid cash to win the containers (rulebook pg. 12). */
function rankContainerLot(ctx: Ctx, action: Extract<Action, { type: 'CALL_BANK' }>): Candidate | null {
  const lot = ctx.view.bank.containerLots[action.lotIndex];
  if (!lot || lot.length === 0) {
    return null;
  }
  const existing = ctx.view.bank.auctions.find(
    (auction) => auction.lotKind === 'container' && auction.lotIndex === action.lotIndex,
  );
  const minBid = existing ? existing.bid + 1 : 1;
  if (minBid > ctx.me.money) {
    return null;
  }

  const value = Math.round(HOLDING_DISCOUNT * 2 * expectedAuctionBid(ctx, lot));
  if (value <= minBid) {
    return null;
  }
  // Bid the minimum needed to lead. You only win if you're still leading at the start of your next
  // turn, and bidding above the minimum buys no extra protection against being outbid — just a
  // worse price if nobody does.
  return { action: { ...action, lotKind: 'container', bid: minBid }, score: 26 + (value - minBid) };
}

/** Cash lot: bid containers off your board to win the cash (rulebook pg. 12–14). */
function rankCashLot(ctx: Ctx, action: Extract<Action, { type: 'CALL_BANK' }>): Candidate | null {
  const cash = ctx.view.bank.cashLots[action.lotIndex];
  if (!cash) {
    return null;
  }
  const existing = ctx.view.bank.auctions.find(
    (auction) => auction.lotKind === 'cash' && auction.lotIndex === action.lotIndex,
  );
  const needed = existing ? existing.bid + 1 : 1;

  // Only the count matters to the engine, so surrender the cheapest stock — and factory stock before
  // harbor stock, since factory containers score $0 at game end while harbor ones score $2.
  const byPrice = (a: { price: number }, b: { price: number }) => a.price - b.price;
  const board = [...[...ctx.me.factoryStore].sort(byPrice), ...[...ctx.me.harborStore].sort(byPrice)];
  if (board.length < needed) {
    return null;
  }
  const containerBid = board.slice(0, needed);
  const surrendered = containerBid.reduce((sum, container) => sum + container.price, 0);
  if (cash <= surrendered) {
    return null;
  }
  return { action: { ...action, lotKind: 'cash', containerBid }, score: 18 + (cash - surrendered) };
}

/** Call Bank — `legalActions` always sets `lotKind`; `applyAction` defaults it to 'container'. */
export function rankCallBank(ctx: Ctx, action: Extract<Action, { type: 'CALL_BANK' }>): Candidate | null {
  return (action.lotKind ?? 'container') === 'cash' ? rankCashLot(ctx, action) : rankContainerLot(ctx, action);
}
