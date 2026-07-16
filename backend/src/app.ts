import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { GameState, Viewer } from '@container/engine';
import { BotRepository } from './bots';
import type { DB } from './db';
import { createDefaultRegistry } from './games';
import type { AnyGameModule, BotDriver, ErrorResponse, ModuleContext } from './games';
import { GameRegistry } from './games';
import { GameHub } from './hub';
import type { Lobby, LobbyMember } from './lobbies';
import { LobbyRepository } from './lobbies';
import { GameRepository } from './repository';

export interface AppOptions {
  db: DB;
  logger?: boolean;
  /** Absolute path to the built UI (`ui/dist`). When set, the server also serves the web app. */
  staticDir?: string;
  /**
   * The games this server hosts. Defaults to the standard registry (Container). Injected so a test
   * can host a stub game without touching the real one.
   */
  registry?: GameRegistry;
}

/** `NewSeat` is a name plus a per-seat AI flag. `bot` is stripped before the engine ever sees the seat. */
interface NewSeat {
  name: string;
  bot?: boolean;
}

interface CreateGameBody {
  players: NewSeat[];
}

interface ActionBody {
  playerId: string;
  action: unknown;
}

/**
 * Build a Fastify instance wired to a database. Pure factory — no listening, easy to test.
 *
 * The core here is **game-agnostic by intent** (roadmap C0): it owns games, lobbies and the live
 * stream, and defers everything that is a *rule* — how to deal a game, what an action is, what an
 * error means, which seats a bot drives — to the `GameModule` for that game. Until C1 puts a
 * `game_type` on the rows, every game is Container's; `moduleFor` is the single place that assumption
 * lives, so C1 is a one-function change rather than a hunt.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const registry = options.registry ?? createDefaultRegistry();
  const repo = new GameRepository(options.db);
  const lobbies = new LobbyRepository(options.db);
  const botSeats = new BotRepository(options.db);
  const hub = new GameHub();

  /**
   * ⚠️ **C0 can host exactly one game, and this is why.** A `games` row is an id and a JSON blob;
   * there is no `game_type` column yet, so persistence genuinely cannot tell two games apart. Rather
   * than guess a module for a row — and hand one game's state to another game's rules — the core
   * refuses to boot with an ambiguous registry. Registering a second game before C1 is a bug, and
   * failing loudly at startup beats discovering it when someone's game is loaded by the wrong engine.
   *
   * C1 adds the column, backfills it to `'container'`, and turns `moduleFor` into a real lookup. That
   * is the one change that makes a second game possible — everything else here is already generic.
   */
  const catalog = registry.list();
  if (catalog.length !== 1) {
    throw new Error(
      `Exactly one game may be registered until roadmap C1 adds a game_type column (got ${catalog.length}). ` +
        `Without it, the server cannot tell which module owns an existing game row.`,
    );
  }

  /** Which game's rules a row plays by. Today: the only one there is. */
  const onlyModule = registry.require(catalog[0]!.id);
  const moduleFor = (_gameId: string): AnyGameModule => onlyModule;

  /** The module used to *create* games, and to validate seat counts before one exists. */
  const creationModule = onlyModule;

  /** Per-module AI drivers and contexts. A module's routes must tick *its own* driver, not a shared one. */
  const drivers = new Map<string, BotDriver>();
  const contexts = new Map<string, ModuleContext>();
  /** Stand-in for a game with no AI. Keeps every caller free of `?.tick` noise. */
  const noBots: BotDriver = { tick: () => {} };

  /**
   * Play a game's AI seats forward, until a human is on the clock again. Synchronous, so a route can
   * simply re-read the game afterwards and reply with the post-bot state. A no-op for a game whose
   * module has no bots.
   */
  const tick = (gameId: string): void => {
    // An abandoned game is out of play, and the AI must respect that. The bots run server-side and
    // are driven on *reads* as well as writes, so without this gate an abandoned game's bot seats
    // would keep playing it forever — the one way a soft-deleted game could still change under you.
    // The gate lives here rather than in any module: abandonment is a platform concern, and no game
    // should have to re-implement it.
    if (repo.isAbandoned(gameId)) return;
    drivers.get(moduleFor(gameId).id)?.tick(gameId);
  };

  /**
   * Broadcast new state to every client, each projected for its own seat(s), then let the module push
   * any side-channel of its own (Container: the pending auction). The one way to say "a game moved".
   */
  const pushGame = (gameId: string, state: unknown): void => {
    const module = moduleFor(gameId);
    hub.broadcast(gameId, state as GameState, botSeats.listForGame(gameId));
    module.onStateChanged?.(state, contexts.get(module.id)!);
  };

  const activeIdOf = (gameId: string, state: unknown): string | null =>
    moduleFor(gameId).summarize(state).activePlayerId;

  /** `?viewer=p1,p3` ⇒ those seats; omitted ⇒ follow the active player (hotseat); `?viewer=` ⇒ none. */
  const viewerFrom = (raw: string | undefined, gameId: string, state: unknown): Viewer =>
    raw !== undefined ? raw.split(',').filter(Boolean) : activeIdOf(gameId, state);

  const sendError = (reply: FastifyReply, mapped: ErrorResponse) =>
    reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } });

  /** Map a domain error via the game's own module. Unclaimed errors bubble to Fastify's 500 handler. */
  const sendGameError = (reply: FastifyReply, module: AnyGameModule, error: unknown): FastifyReply => {
    const mapped = module.mapError(error);
    if (!mapped) throw error;
    return sendError(reply, mapped);
  };

  const badRequest = (reply: FastifyReply, message: string) =>
    reply.code(400).send({ error: { code: 'BAD_ACTION', message } });

  const notFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

  /**
   * 409, not 404: the game demonstrably exists and you may still look at it — it just can't be played
   * any more. A 404 would tell a client mid-game that its game had vanished, which isn't what happened.
   */
  const abandoned = (reply: FastifyReply, id: string) =>
    reply.code(409).send({
      error: { code: 'GAME_ABANDONED', message: `Game "${id}" was abandoned and can no longer be played` },
    });

  /** Deal a new game and record which of its seats an AI holds. */
  const startGame = (seats: readonly NewSeat[]): unknown => {
    const state = creationModule.createGame({
      id: randomUUID(),
      players: seats.map((seat) => ({ name: seat.name })),
      // Randomness is injected, never reached for inside a module — that is what keeps every engine
      // pure, deterministic and replayable.
      rng: Math.random,
    });
    repo.create(creationModule, state);

    const { id: gameId, players } = creationModule.summarize(state);
    // Seat i is always the i-th player (see createGame), so a seat's bot flag maps straight to an id.
    // Recorded outside the game state — the engine never learns which seats are bots.
    const botIds = players.filter((_, seat) => seats[seat]?.bot === true).map((player) => player.id);
    if (botIds.length > 0) botSeats.setForGame(gameId, botIds);

    // A bot in an early seat should already have played by the time anyone sees the board.
    tick(gameId);
    return repo.get(gameId) ?? state;
  };

  /** The `{ game, bots }` payload every state-returning route replies with. */
  const gamePayload = (gameId: string, state: unknown, viewer: Viewer) => ({
    game: moduleFor(gameId).viewFor(state, viewer),
    bots: botSeats.listForGame(gameId),
  });

  app.register(fastifyWebsocket);

  /**
   * Refuse every mutating request against an abandoned game, whatever route it targets.
   *
   * A hook rather than a check per route, because **modules register their own mutating endpoints**
   * (Container's `/auction/bids` and `/auction/resolve` both reach `applyAction`) and those would
   * otherwise sail straight past an abandon check that only `/actions` did. Gating centrally means a
   * game never has to know what abandonment is — which is the whole point of it being a platform
   * concern rather than a rule.
   *
   * ⚠️ Fastify binds hooks to routes **at registration time**, so this must stay above every route
   * below it. Move it down and it silently stops protecting the routes it skipped.
   */
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    // The route *pattern* ('/games/:id/actions'), not the URL — so a query string can't fool it.
    const route = request.routeOptions?.url;
    if (!route?.startsWith('/games/:id/')) return;
    if (route === '/games/:id/abandon') return; // idempotent: abandoning twice is a success
    const gameId = (request.params as { id?: string }).id;
    if (gameId && repo.isAbandoned(gameId)) return abandoned(reply, gameId);
  });

  app.get('/health', async () => ({ status: 'ok' }));

  /** The games this site can host — what C2's picker lists. */
  app.get('/games/catalog', async () => ({ games: registry.list() }));

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
        tick(request.params.id); // a watching client is enough to drive stalled bot turns
        // Send the first snapshot on the next tick, after the open handshake settles, so a client
        // that attaches its message handler right after connecting never misses it.
        // The hub still projects with the engine's own `viewFor`; making it module-driven is C1.
        setImmediate(() =>
          hub.sendState(socket, state as GameState, viewer, botSeats.listForGame(request.params.id)),
        );
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
                  bot: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const started = startGame(request.body.players);
        const gameId = creationModule.summarize(started).id;
        return reply.code(201).send(gamePayload(gameId, started, activeIdOf(gameId, started)));
      } catch (error) {
        return sendGameError(reply, creationModule, error);
      }
    },
  );

  // In-progress games, for the home-screen "resume" list. Summaries only — no secret scoring cards.
  // Abandoned games are excluded — that's what abandoning one is for.
  app.get('/games', async () => ({ games: repo.listActive((id) => moduleFor(id)) }));

  /**
   * Abandon a game: close out something nobody intends to finish, so it stops cluttering the resume
   * list. A **soft delete** — the row and its move log survive, and the game stays readable; it just
   * can't be played on, and its bots stop.
   *
   * Deliberately **not** scored. `status: 'ended'` means a game reached its real end and
   * `finalScoring` ran; an abandoned game has no legitimate winner, and inventing one would make
   * `results`/`winnerIds` lie about a game nobody finished.
   *
   * Game-agnostic on purpose: abandoning needs to know nothing about containers or bids, so it lives
   * in the core and every future game gets it for free. No `GameModule` hook required.
   *
   * Idempotent — abandoning twice is a success, so a double-click or a retry is harmless. Not
   * authenticated, like every other seat action here (trusted-LAN use).
   */
  app.post<{ Params: { id: string } }>('/games/:id/abandon', async (request, reply) => {
    if (!repo.get(request.params.id)) return notFound(reply, request.params.id);
    repo.abandon(request.params.id);
    // Tell anyone still watching, so a client sitting on the board finds out rather than discovering
    // it on its next rejected move.
    hub.broadcastEach(request.params.id, () => ({ type: 'abandoned', gameId: request.params.id }));
    return reply.send({ abandoned: true });
  });

  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>('/games/:id', async (request, reply) => {
    if (!repo.get(request.params.id)) return notFound(reply, request.params.id);
    // Looking at a game is enough to drive it. Bot turns are normally played by whatever mutation
    // preceded them, but nothing mutates while it is *already* a bot's move — after a restart, or a
    // game seeded any other way, the AI would sit there forever and no human could unstick it,
    // because it isn't their turn. Ticking on read makes that self-healing; it's a no-op with no
    // bots, or when a human is on the clock.
    tick(request.params.id);
    const state = repo.get(request.params.id)!;
    return reply.send({
      ...gamePayload(request.params.id, state, viewerFrom(request.query.viewer, request.params.id, state)),
      // Readable but not playable — say so, so a client that holds a link can show it rather than
      // offering moves that will only 409.
      ...(repo.isAbandoned(request.params.id) ? { abandoned: true } : {}),
    });
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
            // Deliberately opaque: the route can't enumerate every game's action types, so validation
            // is `module.parseAction`'s job in full. Don't re-add a `type` enum here.
            action: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);
      // Checked before the module is consulted: an abandoned game is out of play whatever the action
      // is, and no game should have to know what abandonment means.
      if (repo.isAbandoned(request.params.id)) return abandoned(reply, request.params.id);
      const module = moduleFor(request.params.id);

      const parsed = module.parseAction(request.body.action);
      if (!parsed.ok) return badRequest(reply, parsed.message);

      // The module may own this action through a flow of its own (Container's delivery auction
      // collects sealed bids server-side), in which case `/actions` is the wrong door.
      const pending = module.pendingStep?.(state, parsed.action);
      if (pending) return sendError(reply, pending);

      try {
        const next = module.applyAction(state, request.body.playerId, parsed.action);
        repo.update(module, next);
        pushGame(request.params.id, next); // tell every connected client
        // Let the AI take any seats that are now on the clock, before we reply — so the caller gets
        // back the state as it stands once the bots have finished, not a snapshot mid-round.
        tick(request.params.id);
        // Read back rather than replying with `next`: the bots may have played several turns since.
        const settled = repo.get(request.params.id) ?? next;
        // Project the reply for the acting client's own seats (not the active player), so ending a
        // turn never leaks the next player's card. No `?viewer` ⇒ follow the active player (hotseat).
        return reply.send(
          gamePayload(request.params.id, settled, viewerFrom(request.query.viewer, request.params.id, settled)),
        );
      } catch (error) {
        return sendGameError(reply, module, error);
      }
    },
  );

  // Give every registered game its context, its AI driver, and its own endpoints — Container's
  // delivery auction being the one that exists. The core knows nothing about what they do.
  //
  // ⚠️ Module routes share one URL space, so two games both claiming `/games/:id/auction` would be a
  // Fastify duplicate-route crash at boot (loud, not silent — good). Namespacing them is C1's job,
  // once `game_type` exists to namespace by.
  for (const info of registry.list()) {
    const module = registry.require(info.id);
    const ctx: ModuleContext = {
      db: options.db,
      // Bound to this module, so it can persist its own state without naming itself.
      games: {
        get: (gameId) => repo.get(gameId),
        update: (state) => repo.update(module, state),
      },
      botSeats,
      hub,
      pushGame,
      // A getter, because the driver below is built *from* this context.
      get bots(): BotDriver {
        return drivers.get(module.id) ?? noBots;
      },
    };
    contexts.set(module.id, ctx);
    const driver = module.createBotDriver?.(ctx);
    if (driver) drivers.set(module.id, driver);
    module.routes?.(app, ctx);
  }

  // --- Lobbies: create an empty room, join by code with a name, start when every seat is filled ---

  const lobbyNotFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'LOBBY_NOT_FOUND', message: `No lobby with id "${id}"` } });

  app.post<{ Body: { seats?: number } }>(
    '/lobbies',
    { schema: { body: { type: 'object', properties: { seats: { type: 'number' } } } } },
    async (request, reply) => {
      const { minPlayers, maxPlayers } = creationModule;
      const seats = request.body?.seats ?? minPlayers;
      if (!Number.isInteger(seats) || seats < minPlayers || seats > maxPlayers) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_SEAT_COUNT', message: `Seats must be ${minPlayers}–${maxPlayers}` } });
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

  app.post<{ Params: { id: string }; Body: { name: string; bot?: boolean } }>(
    '/lobbies/:id/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: { name: { type: 'string', minLength: 1 }, bot: { type: 'boolean' } },
        },
      },
    },
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
      const claimed: LobbyMember = { name: request.body.name.trim(), bot: request.body.bot === true };
      const members = lobby.members.map((member, i) => (i === seat ? claimed : member));
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
      const members = lobby.members as LobbyMember[];
      const started = startGame(members.map((member) => ({ name: member.name, bot: member.bot })));
      const gameId = creationModule.summarize(started).id;
      lobbies.update({ ...lobby, status: 'started', gameId });
      return reply.code(201).send(gamePayload(gameId, started, activeIdOf(gameId, started)));
    } catch (error) {
      return sendGameError(reply, creationModule, error);
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
