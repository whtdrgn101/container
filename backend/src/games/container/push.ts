import type { GameState, Viewer } from '@game-hub/engine/container';
import type { ModuleContext } from '../module';
import { AuctionRepository, auctionViewFor, syncAuction } from './auctions';

/**
 * The single seat an auction projection is "for". A client bound to one seat (`?viewer=p2`) sees its
 * own bid; one holding several (or hotseat's `null`, which drives them all) gets `null` and asks
 * per-seat via `GET /games/:id/auction?viewer=<seat>` as it prompts each player in turn.
 */
export const primarySeat = (viewer: Viewer): string | null => {
  if (typeof viewer === 'string') return viewer;
  return Array.isArray(viewer) && viewer.length === 1 ? viewer[0]! : null;
};

/**
 * Push the pending auction (or its absence) to every connected client, each seeing only what it may.
 *
 * The auction is **derived from game state** via `syncAuction` rather than passed in, so there is one
 * answer to "what auction is open" and callers can't push a stale one. Every path that changes an
 * auction saves it first, so this always reads the truth.
 *
 * The one implementation for humans and bots alike: it backs both the module's `onStateChanged` and
 * the bid route's own push.
 */
export function pushAuction(ctx: ModuleContext, state: GameState): void {
  const auction = syncAuction(new AuctionRepository(ctx.db), state);
  ctx.hub.broadcastEach(state.id, (viewer) => ({
    type: 'auction',
    auction: auction ? auctionViewFor(auction, state, primarySeat(viewer)) : null,
  }));
}
