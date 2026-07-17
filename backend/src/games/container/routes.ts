import { applyAction, viewFor } from '@game-hub/engine/container';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { GameState, Viewer } from '@game-hub/engine/container';
import type { ModuleContext } from '../module';
import { AuctionRepository, auctionViewFor, applyBid, syncAuction } from './auctions';
import { mapContainerError } from './errors';
import { pushAuction } from './push';

/**
 * Container's delivery-auction endpoints — registered through `GameModule.routes`, so the shared core
 * never learns what a sealed bid is.
 *
 * Why these live outside `POST /actions`: the engine's `DELIVER` needs every opponent's bid at once
 * (pg. 15 — opponents bid facedown, simultaneously), but bids are secret and only each player can
 * supply their own. So the auction is a short-lived record the server owns (like a lobby), and
 * exactly one `DELIVER` is applied when it resolves.
 *
 * **Paths are relative to `/games/:id/container`** — the core registers this scope under that prefix
 * (roadmap C1), so `/auction` here serves `GET /games/:id/container/auction`. `request.params.id` comes
 * from the prefix. Don't write absolute paths: an unprefixed `/auction` would be handed *every* game's
 * requests, including games these rules can't read.
 *
 * The core's scope guard has already established, before any handler below runs, that the game exists
 * and is a Container game — so `gameOf` is never undefined in practice, and a state here is always ours.
 *
 * **Every response here goes through `auctionViewFor`.** The raw `DeliveryAuction.bids` must never
 * reach a client — same rule as `viewFor` for scoring cards.
 */
export function registerAuctionRoutes(app: FastifyInstance, ctx: ModuleContext): void {
  const auctions = new AuctionRepository(ctx.db);

  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

  const conflict = (reply: FastifyReply, code: string, message: string) =>
    reply.code(409).send({ error: { code, message } });

  const gameOf = (id: string) => ctx.games.get(id) as GameState | undefined;

  /** `?viewer=p1,p3` ⇒ those seats; omitted ⇒ follow the active player (hotseat); `?viewer=` ⇒ none. */
  const viewerFrom = (raw: string | undefined, state: GameState): Viewer =>
    raw !== undefined ? raw.split(',').filter(Boolean) : (state.players[state.activePlayerIndex]?.id ?? null);

  /** The open auction for a game, projected for one seat. `{ auction: null }` when none is open. */
  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>(
    '/auction',
    async (request, reply) => {
      if (!gameOf(request.params.id)) return notFound(reply, request.params.id);
      ctx.bots.tick(request.params.id); // same self-healing as GET /games/:id
      const state = gameOf(request.params.id)!;
      const auction = syncAuction(auctions, state);
      if (!auction) return reply.send({ auction: null });
      const viewer = request.query.viewer ? request.query.viewer : null;
      return reply.send({ auction: auctionViewFor(auction, state, viewer) });
    },
  );

  /** Place one seat's sealed bid. $0 is a legal bluff (pg. 15), so the floor is 0, not 1. */
  app.post<{ Params: { id: string }; Body: { playerId: string; bid: number } }>(
    '/auction/bids',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'bid'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            bid: { type: 'integer', minimum: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      const state = gameOf(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const auction = syncAuction(auctions, state);
      if (!auction) return conflict(reply, 'NO_OPEN_AUCTION', 'No delivery auction is open');

      const { playerId, bid } = request.body;
      // `applyBid` is the one implementation of what a bid means — the BotRunner places bids through
      // it too, so a bot is held to exactly the rules a human is.
      const outcome = applyBid(auction, state, playerId, bid);
      if (!outcome.ok) return conflict(reply, outcome.code, outcome.message);

      auctions.save(outcome.auction);
      // Only the auction changed — the game state hasn't moved, so don't push it.
      pushAuction(ctx, state);
      // This bid may be the one the AI seats were waiting on — let them answer before we reply.
      ctx.bots.tick(request.params.id);

      const settled = gameOf(request.params.id) ?? state;
      const current = auctions.get(request.params.id);
      if (!current) {
        // The bots finished the auction outright (they were the only ones left to act).
        return reply.send({ auction: null });
      }
      return reply.send({ auction: auctionViewFor(current, settled, playerId) });
    },
  );

  /**
   * The deliverer resolves the auction: accept the high bid (collecting it plus a matching
   * government subsidy) or buy out (pay the Bank, keep the containers). This is the one place a
   * DELIVER reaches the engine.
   */
  app.post<{
    Params: { id: string };
    Body: { playerId: string; buyout?: boolean; winnerId?: string };
    Querystring: { viewer?: string };
  }>(
    '/auction/resolve',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            buyout: { type: 'boolean' },
            winnerId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const state = gameOf(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const auction = syncAuction(auctions, state);
      if (!auction) return conflict(reply, 'NO_OPEN_AUCTION', 'No delivery auction is open');
      if (auction.phase !== 'decision') {
        return conflict(reply, 'BIDDING_OPEN', 'Not every opponent has bid yet');
      }
      if (request.body.playerId !== auction.delivererId) {
        return conflict(reply, 'NOT_THE_DELIVERER', 'Only the deliverer resolves the auction');
      }

      try {
        // The engine validates the choice (and demands one when a runoff stayed level) — we only
        // pass it along, so there is one place that decides what a legal resolution is.
        const buyout = request.body.buyout === true;
        const next = applyAction(state, auction.delivererId, {
          type: 'DELIVER',
          bids: auction.bids,
          runoffBids: auction.runoffBids,
          ...(buyout ? { buyout: true } : {}),
          ...(!buyout && request.body.winnerId ? { chosenWinnerId: request.body.winnerId } : {}),
        });
        ctx.games.update(next);
        auctions.clear(request.params.id);

        // DELIVER ends the turn, so the next player is up and no auction is open.
        ctx.pushGame(request.params.id, next);
        ctx.bots.tick(request.params.id);

        const settled = (gameOf(request.params.id) ?? next) as GameState;
        // Same shape as the core's `gamePayload` — `gameType` included, since a generic client reads
        // this reply exactly like any other and still has to know which board it belongs to.
        return reply.send({
          game: viewFor(settled, viewerFrom(request.query.viewer, settled)),
          gameType: 'container',
          bots: ctx.botSeats.listForGame(request.params.id),
        });
      } catch (error) {
        const mapped = mapContainerError(error);
        if (!mapped) throw error;
        return reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } });
      }
    },
  );
}
