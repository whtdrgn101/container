import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { applyAction, COLORS, createGame, GameError, MAX_PLAYERS, MIN_PLAYERS, SCORING_CARDS, viewFor } from '@container/engine';
import type { Action, Color, District, GameState, NewPlayer, ShipLocation, StoredContainer, Viewer } from '@container/engine';
import type { DeliveryAuction } from './auctions';
import {
  AuctionRepository,
  allBidsIn,
  allRunoffBidsIn,
  auctionIsDue,
  auctionViewFor,
  biddersFor,
  openAuctionFor,
  tiedForLead,
} from './auctions';
import type { DB } from './db';
import { GameHub } from './hub';
import type { Lobby } from './lobbies';
import { LobbyRepository } from './lobbies';
import { GameRepository } from './repository';

export interface AppOptions {
  db: DB;
  logger?: boolean;
  /** Absolute path to the built UI (`ui/dist`). When set, the server also serves the web app. */
  staticDir?: string;
}

interface CreateGameBody {
  players: NewPlayer[];
}

interface RawContainer {
  color: string;
  price: number;
}

interface RawAction {
  type: Action['type'];
  color?: string;
  placements?: RawContainer[];
  district?: string;
  arrangement?: RawContainer[];
  to?: { kind?: string; playerId?: string };
  sellerId?: string;
  bought?: RawContainer[];
  bids?: Record<string, number>;
  runoffBids?: Record<string, number>;
  buyout?: boolean;
  lotIndex?: number;
  bid?: number;
  lotKind?: string;
  containerBid?: RawContainer[];
}

interface ActionBody {
  playerId: string;
  action: RawAction;
}

/** The id of whose turn it is — the default viewer for a shared (hotseat) client. */
const activeId = (state: GameState): string | null => state.players[state.activePlayerIndex]?.id ?? null;

/** Create a fresh game from a list of player names: shuffle the scoring deck and deal one per seat. */
function newGameFromNames(names: string[]): GameState {
  const cardIds = SCORING_CARDS.map((card) => card.id);
  for (let i = cardIds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = cardIds[i]!;
    cardIds[i] = cardIds[j]!;
    cardIds[j] = swap;
  }
  const players = names.map((name, seat) => ({ name, scoringCardId: cardIds[seat]! }));
  return createGame({ id: randomUUID(), players });
}

/** Map a domain error to an HTTP status. Unknown errors bubble to Fastify's 500 handler. */
function sendGameError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof GameError) {
    const status =
      error.code === 'PLAYER_NOT_FOUND'
        ? 404
        : error.code === 'INVALID_PLAYER_COUNT'
          ? 400
          : 409; // illegal move given current state (wrong turn, no actions, bad build, …)
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

/** JSON-schema for one container placement/arrangement item ({ color, price }). */
const STORED_CONTAINER_SCHEMA = {
  type: 'object',
  required: ['color', 'price'],
  properties: {
    color: { type: 'string' },
    price: { type: 'number' },
  },
} as const;

const badRequest = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: { code: 'BAD_ACTION', message } });

const notFound = (reply: FastifyReply, id: string) =>
  reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

/** Turn a validated request body into a typed engine Action, or reply 400 and return null. */
function parseAction(reply: FastifyReply, raw: RawAction): Action | null {
  switch (raw.type) {
    case 'PRODUCE':
      return raw.placements
        ? { type: 'PRODUCE', placements: raw.placements as StoredContainer[] }
        : { type: 'PRODUCE' };
    case 'BUILD_FACTORY':
      if (!raw.color || !COLORS.includes(raw.color as Color)) {
        badRequest(reply, 'BUILD_FACTORY requires a valid container color');
        return null;
      }
      return { type: 'BUILD_FACTORY', color: raw.color as Color };
    case 'BUILD_WAREHOUSE':
      return { type: 'BUILD_WAREHOUSE' };
    case 'REPRICE':
      if (raw.district !== 'factory' && raw.district !== 'harbor') {
        badRequest(reply, 'REPRICE requires a district of "factory" or "harbor"');
        return null;
      }
      return raw.arrangement
        ? { type: 'REPRICE', district: raw.district as District, arrangement: raw.arrangement as StoredContainer[] }
        : { type: 'REPRICE', district: raw.district as District };
    case 'SAIL': {
      const to = raw.to;
      if (!to || (to.kind !== 'ocean' && to.kind !== 'harbor' && to.kind !== 'island' && to.kind !== 'bank')) {
        badRequest(reply, 'SAIL requires a destination kind of ocean/harbor/island/bank');
        return null;
      }
      if (to.kind === 'harbor') {
        if (!to.playerId) {
          badRequest(reply, 'SAIL to a harbor requires a playerId');
          return null;
        }
        return { type: 'SAIL', to: { kind: 'harbor', playerId: to.playerId } };
      }
      return { type: 'SAIL', to: { kind: to.kind } as ShipLocation };
    }
    case 'FACTORY_PURCHASE':
      if (!raw.sellerId) {
        badRequest(reply, 'FACTORY_PURCHASE requires a sellerId');
        return null;
      }
      return raw.bought
        ? { type: 'FACTORY_PURCHASE', sellerId: raw.sellerId, bought: raw.bought as StoredContainer[] }
        : { type: 'FACTORY_PURCHASE', sellerId: raw.sellerId };
    case 'HARBOR_PURCHASE':
      return raw.bought
        ? { type: 'HARBOR_PURCHASE', bought: raw.bought as StoredContainer[] }
        : { type: 'HARBOR_PURCHASE' };
    case 'DELIVER':
      return {
        type: 'DELIVER',
        ...(raw.bids ? { bids: raw.bids } : {}),
        ...(raw.runoffBids ? { runoffBids: raw.runoffBids } : {}),
        ...(raw.buyout ? { buyout: true } : {}),
      };
    case 'REQUEST_LOAN':
      return { type: 'REQUEST_LOAN' };
    case 'REPAY_LOAN':
      return { type: 'REPAY_LOAN' };
    case 'CALL_BANK':
      if (typeof raw.lotIndex !== 'number') {
        badRequest(reply, 'CALL_BANK requires a lotIndex');
        return null;
      }
      return {
        type: 'CALL_BANK',
        lotIndex: raw.lotIndex,
        lotKind: raw.lotKind === 'cash' ? 'cash' : 'container',
        ...(raw.bid !== undefined ? { bid: raw.bid } : {}),
        ...(raw.containerBid ? { containerBid: raw.containerBid as StoredContainer[] } : {}),
      };
    case 'LOAD_FROM_BANK':
      return { type: 'LOAD_FROM_BANK' };
    case 'END_TURN':
      return { type: 'END_TURN' };
    default:
      badRequest(reply, `Unknown action type "${String(raw.type)}"`);
      return null;
  }
}

/** Build a Fastify instance wired to a database. Pure factory — no listening, easy to test. */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const repo = new GameRepository(options.db);
  const lobbies = new LobbyRepository(options.db);
  const auctions = new AuctionRepository(options.db);
  const hub = new GameHub();

  /**
   * The single seat an auction projection is "for". A client bound to one seat (`?viewer=p2`) sees
   * its own bid; one holding several (or hotseat's `null`, which drives them all) gets `null` and
   * asks per-seat via `GET /games/:id/auction?viewer=<seat>` as it prompts each player in turn.
   */
  const primarySeat = (viewer: Viewer): string | null => {
    if (typeof viewer === 'string') return viewer;
    return Array.isArray(viewer) && viewer.length === 1 ? viewer[0]! : null;
  };

  /** Push the auction (or its absence) to every client, each seeing only what it may. */
  const pushAuction = (gameId: string, auction: DeliveryAuction | null, state: GameState) =>
    hub.broadcastEach(gameId, (viewer) => ({
      type: 'auction',
      auction: auction ? auctionViewFor(auction, state, primarySeat(viewer)) : null,
    }));

  /**
   * Keep the pending auction in step with the game: open one whenever a ship is at Container Island
   * with cargo, and make sure none lingers otherwise. The engine owns the rule (`auctionIsDue` →
   * `mustDeliver`); this only mirrors it.
   *
   * Called on **read as well as write**, deliberately. Deriving the auction from the game state
   * rather than trusting a row to have been written makes it self-healing: a game that reached the
   * island before this feature shipped (a live game mid-upgrade) or any state restored without an
   * auction row would otherwise wedge at the island forever, with no way to resolve the delivery.
   */
  const syncAuction = (state: GameState): DeliveryAuction | null => {
    if (!auctionIsDue(state)) {
      if (auctions.get(state.id)) auctions.clear(state.id);
      return null;
    }
    const existing = auctions.get(state.id);
    if (existing && existing.delivererId === activeId(state)) return existing;
    const fresh = openAuctionFor(state);
    auctions.save(fresh);
    return fresh;
  };

  app.register(fastifyWebsocket);

  app.get('/health', async () => ({ status: 'ok' }));

  // Live game stream. A client connects, gets an immediate snapshot, then receives a push on every
  // state change — each projected for `?viewer=<id>` (omit to follow the active player, for hotseat).
  app.register(async (instance) => {
    instance.get<{ Params: { id: string }; Querystring: { viewer?: string } }>(
      '/games/:id/stream',
      { websocket: true },
      (socket, request) => {
        const state = repo.get(request.params.id);
        if (!state) {
          socket.close(1008, `No game with id "${request.params.id}"`);
          return;
        }
        // No `?viewer` ⇒ follow the active player; `?viewer=p1,p3` ⇒ those seats; `?viewer=` ⇒ spectator.
        const viewer =
          request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : null;
        const unsubscribe = hub.subscribe(request.params.id, socket, viewer);
        socket.on('close', unsubscribe);
        // Send the first snapshot on the next tick, after the open handshake settles, so a client
        // that attaches its message handler right after connecting never misses it.
        setImmediate(() => hub.sendState(socket, state, viewer));
      },
    );
  });

  app.post<{ Body: CreateGameBody }>(
    '/games',
    {
      schema: {
        body: {
          type: 'object',
          required: ['players'],
          properties: {
            players: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1 },
                  startingColor: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const state = newGameFromNames(request.body.players.map((player) => player.name));
        repo.create(state);
        return reply.code(201).send({ game: viewFor(state, activeId(state)) });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  // In-progress games, for the home-screen "resume" list. Summaries only — no secret scoring cards.
  app.get('/games', async () => ({ games: repo.listActive() }));

  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>('/games/:id', async (request, reply) => {
    const state = repo.get(request.params.id);
    if (!state) return notFound(reply, request.params.id);
    // No `?viewer` ⇒ follow the active player (hotseat). `?viewer=p1,p3` ⇒ those seats; `?viewer=` ⇒ none.
    const viewer =
      request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : activeId(state);
    return reply.send({ game: viewFor(state, viewer) });
  });

  app.post<{ Params: { id: string }; Body: ActionBody; Querystring: { viewer?: string } }>(
    '/games/:id/actions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'action'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            action: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'PRODUCE',
                    'BUILD_FACTORY',
                    'BUILD_WAREHOUSE',
                    'REPRICE',
                    'SAIL',
                    'FACTORY_PURCHASE',
                    'HARBOR_PURCHASE',
                    'DELIVER',
                    'REQUEST_LOAN',
                    'REPAY_LOAN',
                    'CALL_BANK',
                    'LOAD_FROM_BANK',
                    'END_TURN',
                  ],
                },
                color: { type: 'string' },
                district: { type: 'string', enum: ['factory', 'harbor'] },
                sellerId: { type: 'string' },
                lotIndex: { type: 'number' },
                lotKind: { type: 'string', enum: ['container', 'cash'] },
                containerBid: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                placements: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                arrangement: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                bought: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                bids: { type: 'object', additionalProperties: { type: 'number' } },
                runoffBids: { type: 'object', additionalProperties: { type: 'number' } },
                buyout: { type: 'boolean' },
                to: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['ocean', 'harbor', 'island', 'bank'] },
                    playerId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const action = parseAction(reply, request.body.action);
      if (!action) return reply; // parseAction already sent a 400

      // A pending auction owns the DELIVER: its sealed bids live server-side and are revealed only
      // once everyone has committed. Letting a client post its own DELIVER here would hand the
      // deliverer every opponent's bid before choosing whether to buy out — the exact leak A1 closes.
      if (action.type === 'DELIVER' && auctionIsDue(state)) {
        return reply.code(409).send({
          error: {
            code: 'AUCTION_PENDING',
            message: 'Resolve the delivery auction via POST /games/:id/auction/resolve',
          },
        });
      }

      try {
        const next = applyAction(state, request.body.playerId, action);
        repo.update(next);
        const auction = syncAuction(next);
        hub.broadcast(request.params.id, next); // push the new state to every connected client
        pushAuction(request.params.id, auction, next);
        // Project the reply for the acting client's own seats (not the active player), so ending a
        // turn never leaks the next player's card. No `?viewer` ⇒ follow the active player (hotseat).
        const viewer =
          request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : activeId(next);
        return reply.send({ game: viewFor(next, viewer) });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  // --- Delivery auctions: sealed bids from each device, then the deliverer accepts or buys out ---
  //
  // Why these live outside `POST /actions`: the engine's DELIVER needs every opponent's bid at once,
  // but bids are secret and only each player can supply their own. So the auction is a short-lived
  // record the server owns (like a lobby), and exactly one DELIVER is applied when it resolves.

  const auctionConflict = (reply: FastifyReply, code: string, message: string) =>
    reply.code(409).send({ error: { code, message } });

  /** The open auction for a game, projected for one seat. `{ auction: null }` when none is open. */
  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>(
    '/games/:id/auction',
    async (request, reply) => {
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);
      const auction = syncAuction(state);
      if (!auction) return reply.send({ auction: null });
      const viewer = request.query.viewer ? request.query.viewer : null;
      return reply.send({ auction: auctionViewFor(auction, state, viewer) });
    },
  );

  /** Place one seat's sealed bid. $0 is a legal bluff (pg. 15), so the floor is 0, not 1. */
  app.post<{ Params: { id: string }; Body: { playerId: string; bid: number } }>(
    '/games/:id/auction/bids',
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
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const auction = syncAuction(state);
      if (!auction) return auctionConflict(reply, 'NO_OPEN_AUCTION', 'No delivery auction is open');
      if (auction.phase === 'decision') {
        return auctionConflict(reply, 'BIDDING_CLOSED', 'Every bid is already in');
      }

      const { playerId, bid } = request.body;
      const inRunoff = auction.phase === 'runoff';
      // In a runoff only the tied players bid again (pg. 16); everyone else is out.
      const owing = inRunoff ? tiedForLead(auction, state) : biddersFor(state, auction.delivererId);
      if (!owing.includes(playerId)) {
        return auctionConflict(
          reply,
          'NOT_A_BIDDER',
          inRunoff
            ? `Player "${playerId}" is not tied for the lead and does not bid in the runoff`
            : `Player "${playerId}" is not bidding in this auction`,
        );
      }
      const round = inRunoff ? auction.runoffBids : auction.bids;
      if (round[playerId] !== undefined) {
        // Bids go facedown and stay there (pg. 15) — no taking one back once committed.
        return auctionConflict(reply, 'ALREADY_BID', `Player "${playerId}" has already bid`);
      }
      const bidder = state.players.find((player) => player.id === playerId)!;
      // A runoff bid is *added* to the opening bid without taking it back, so it's the total that
      // has to be affordable (pg. 16).
      const committed = inRunoff ? (auction.bids[playerId] ?? 0) + bid : bid;
      if (committed > bidder.money) {
        return auctionConflict(reply, 'INSUFFICIENT_FUNDS', `Player "${playerId}" cannot bid $${committed}`);
      }

      // The reveal is what makes the bids simultaneous: nobody's amount is visible until the last
      // opponent has committed, so bidding early costs you nothing and bidding late tells you nothing.
      let next: DeliveryAuction;
      if (inRunoff) {
        next = { ...auction, runoffBids: { ...auction.runoffBids, [playerId]: bid } };
        if (allRunoffBidsIn(next, state)) next = { ...next, phase: 'decision' };
      } else {
        next = { ...auction, bids: { ...auction.bids, [playerId]: bid } };
        if (allBidsIn(next, state)) {
          // Level at the top → a runoff decides it; otherwise straight to the deliverer.
          next = { ...next, phase: tiedForLead(next, state).length > 1 ? 'runoff' : 'decision' };
        }
      }
      auctions.save(next);
      pushAuction(request.params.id, next, state);

      return reply.send({ auction: auctionViewFor(next, state, playerId) });
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
    '/games/:id/auction/resolve',
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
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const auction = syncAuction(state);
      if (!auction) return auctionConflict(reply, 'NO_OPEN_AUCTION', 'No delivery auction is open');
      if (auction.phase !== 'decision') {
        return auctionConflict(reply, 'BIDDING_OPEN', 'Not every opponent has bid yet');
      }
      if (request.body.playerId !== auction.delivererId) {
        return auctionConflict(reply, 'NOT_THE_DELIVERER', 'Only the deliverer resolves the auction');
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
        repo.update(next);
        auctions.clear(request.params.id);

        // DELIVER ends the turn, so the next player is up and no auction is open.
        hub.broadcast(request.params.id, next);
        pushAuction(request.params.id, null, next);

        const viewer =
          request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : activeId(next);
        return reply.send({ game: viewFor(next, viewer) });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  // --- Lobbies: create an empty room, join by code with a name, start when every seat is filled ---

  const lobbyNotFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'LOBBY_NOT_FOUND', message: `No lobby with id "${id}"` } });

  app.post<{ Body: { seats?: number } }>(
    '/lobbies',
    { schema: { body: { type: 'object', properties: { seats: { type: 'number' } } } } },
    async (request, reply) => {
      const seats = request.body?.seats ?? MIN_PLAYERS;
      if (!Number.isInteger(seats) || seats < MIN_PLAYERS || seats > MAX_PLAYERS) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_SEAT_COUNT', message: `Seats must be ${MIN_PLAYERS}–${MAX_PLAYERS}` } });
      }
      const lobby: Lobby = {
        id: randomUUID(),
        seats,
        members: Array.from({ length: seats }, () => null),
        status: 'open',
        gameId: null,
      };
      lobbies.create(lobby);
      return reply.code(201).send({ lobby });
    },
  );

  // The home-screen "waiting for players" list: open lobbies with a free seat.
  app.get('/lobbies', async () => ({ lobbies: lobbies.listOpen() }));

  app.get<{ Params: { id: string } }>('/lobbies/:id', async (request, reply) => {
    const lobby = lobbies.get(request.params.id);
    if (!lobby) return lobbyNotFound(reply, request.params.id);
    return reply.send({ lobby });
  });

  app.post<{ Params: { id: string }; Body: { name: string } }>(
    '/lobbies/:id/join',
    { schema: { body: { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1 } } } } },
    async (request, reply) => {
      const lobby = lobbies.get(request.params.id);
      if (!lobby) return lobbyNotFound(reply, request.params.id);
      if (lobby.status !== 'open') {
        return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
      }
      const seat = lobby.members.findIndex((member) => member === null);
      if (seat === -1) {
        return reply.code(409).send({ error: { code: 'LOBBY_FULL', message: 'All seats are taken' } });
      }
      const members = lobby.members.map((member, i) => (i === seat ? request.body.name.trim() : member));
      const updated: Lobby = { ...lobby, members };
      lobbies.update(updated);
      return reply.send({ lobby: updated, seat });
    },
  );

  app.post<{ Params: { id: string } }>('/lobbies/:id/start', async (request, reply) => {
    const lobby = lobbies.get(request.params.id);
    if (!lobby) return lobbyNotFound(reply, request.params.id);
    if (lobby.status === 'started') {
      return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
    }
    if (lobby.members.some((member) => member === null)) {
      return reply.code(409).send({ error: { code: 'LOBBY_NOT_READY', message: 'Every seat must be filled first' } });
    }
    try {
      const state = newGameFromNames(lobby.members as string[]);
      repo.create(state);
      lobbies.update({ ...lobby, status: 'started', gameId: state.id });
      return reply.code(201).send({ game: viewFor(state, activeId(state)) });
    } catch (error) {
      return sendGameError(reply, error);
    }
  });

  // Serve the built web app (production single-container deploy). API routes above take precedence;
  // any other GET falls back to index.html since the UI is a single page.
  if (options.staticDir) {
    app.register(fastifyStatic, { root: options.staticDir });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === 'GET' && !/^\/(games|lobbies|health)\b/.test(request.url)) {
        return reply.sendFile('index.html');
      }
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
    });
  }

  return app;
}
