import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import fastifyRateLimit from '@fastify/rate-limit';
import { BotRepository } from './bots';
import { ColorRepository, assignColors, colorsForSeats } from './colors';
import type { DB } from './db';
import { createDefaultRegistry, DEFAULT_GAME_ID } from './games';
import type { AnyGameModule, BotDriver, ErrorResponse, ModuleContext, Viewer } from './games';
import { GameRegistry } from './games';
import { GameHub } from './hub';
import type { StateMessage } from './hub';
import type { Lobby, LobbyMember } from './lobbies';
import { RematchRepository } from './rematch';
import type { Rematch } from './rematch';
import { LobbyRepository, LOBBY_SWEEP_INTERVAL_MS, OPEN_LOBBY_TTL_MS } from './lobbies';
import { GameRepository, SchemaUnsupportedError, StaleVersionError } from './repository';
import {
  BODY_LIMIT_BYTES,
  isAllowedWsOrigin,
  MAX_GAME_TYPE_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SEATS,
  WS_MAX_PAYLOAD,
  WsConnectionLimiter,
} from './security';

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
  /**
   * The game a bare `POST /games` or `POST /lobbies` creates when the caller names no type.
   * Defaults to Container, which keeps the hotseat quick-start working.
   */
  defaultGameType?: string;
  /**
   * Randomness for game setup *and* for a module's per-action needs (Can't Stop's dice). Injected so
   * a test can seed it and get a deterministic game. Defaults to `Math.random`.
   */
  rng?: () => number;
  /**
   * Global per-IP rate limit (REVIEW §4.7). Omit to disable — the default, because the test suites
   * make far more requests per app than any human would, and `@fastify/rate-limit` also throttles
   * `app.inject`. Production opts in via `DEFAULT_RATE_LIMIT` (see `server.ts`).
   */
  rateLimit?: { max: number; timeWindow: number | string };
  /**
   * Per-IP concurrent live-stream socket cap (REVIEW §4.7). Defaults to `WS_MAX_CONNECTIONS_PER_IP`
   * (32) — far above any honest client, but the e2e harness funnels a whole suite through one IP via
   * the Vite proxy (whose documented ECONNRESET resets can orphan sockets), so it raises this via
   * `WS_MAX_PER_IP` rather than flaking on a starved cap.
   */
  wsMaxConnectionsPerIp?: number;
  /**
   * Extra origins the live-stream WebSocket accepts an upgrade from, beyond same-origin and
   * no-Origin clients (REVIEW §4.7). Each entry is a full origin (`https://play.lan`) or a bare host.
   * Populated from `ALLOWED_ORIGINS` in production; empty by default (same-origin only).
   */
  allowedOrigins?: readonly string[];
}

/**
 * `NewSeat` is a name plus a per-seat AI flag and optional colour pick. `bot` and `color` are both
 * stripped before the engine ever sees the seat — the engine learns neither what a bot nor a colour is.
 */
interface NewSeat {
  name: string;
  bot?: boolean;
  color?: string;
  /** For a bot seat, the difficulty tier it plays by (CS4). Validated against the game's declared tiers. */
  difficulty?: string;
}

interface CreateGameBody {
  /** Which game to deal. Omit for the server's default (keeps the hotseat quick-start working). */
  gameType?: string;
  players: NewSeat[];
}

interface ActionBody {
  playerId: string;
  action: unknown;
  /**
   * The version the client believes the game is at (REVIEW §4.2). When present and no longer current,
   * the move is refused with `409 STALE_VERSION` — the optimistic-concurrency check that turns a
   * double-click or a stale second device into a no-op instead of a double-apply. Omit for the old
   * unconditional behaviour.
   */
  expectedVersion?: number;
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
  // `bodyLimit` (§4.7): actions are tiny, so cap a hostile/oversized body well below Fastify's 1 MiB
  // default. An over-limit body is rejected with 413 before any handler runs.
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: BODY_LIMIT_BYTES });
  // Generous global per-IP rate limit (§4.7), opt-in so the test suites (which out-request any human,
  // and would trip `inject`) stay green. Registered with `global: false` and driven by our own
  // `onRequest` hook, added here **before any route** so Fastify applies it to all of them: the
  // plugin's own global hook is added only when it finishes loading (at `ready()`), by which point the
  // synchronously-registered routes below have already snapshotted their hooks and would miss it —
  // and `buildApp` is synchronous, so we can't `await` the registration first. The limiter middleware
  // (`app.rateLimit()`) is created lazily on the first request, once the plugin has decorated `app`.
  if (options.rateLimit) {
    void app.register(fastifyRateLimit, { ...options.rateLimit, global: false });
    // Wrap the decorator call so `ReturnType` sees a plain function (not a `this`-bound method).
    const makeLimiter = () => app.rateLimit();
    let limiter: ReturnType<typeof makeLimiter> | undefined;
    app.addHook('onRequest', async function (this: FastifyInstance, request, reply) {
      // `.call(this, …)` because the plugin's middleware is a `this`-bound Fastify hook.
      await (limiter ??= makeLimiter()).call(this, request, reply);
    });
  }
  const allowedOrigins = options.allowedOrigins ?? [];
  // Per-IP cap on concurrent live-stream sockets (§4.7); the hub's room map is otherwise unbounded.
  const wsConnections = new WsConnectionLimiter(options.wsMaxConnectionsPerIp);
  const registry = options.registry ?? createDefaultRegistry();
  const repo = new GameRepository(options.db);
  const lobbies = new LobbyRepository(options.db);
  const botSeats = new BotRepository(options.db);
  // Which colour each seat picked — coordination state beside the game, like bot seats (see colors.ts).
  const colorSeats = new ColorRepository(options.db);

  // Reclaim never-started open lobbies so the table doesn't grow without bound on the persistent
  // volume (REVIEW §4.3). Nothing else ever deletes a lobby. Sweep once at boot, then on an interval
  // that is `unref`'d (so it never keeps the process — or a test's app — alive) and cleared on close.
  // Started lobbies are exempt: join-by-code still resolves them to their game.
  const sweepLobbies = (): void => {
    try {
      lobbies.deleteExpiredOpen(new Date(Date.now() - OPEN_LOBBY_TTL_MS).toISOString());
    } catch (error) {
      app.log.error({ err: error }, 'lobby sweep failed');
    }
  };
  sweepLobbies();
  const sweepTimer = setInterval(sweepLobbies, LOBBY_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
  app.addHook('onClose', async () => clearInterval(sweepTimer));
  const rematches = new RematchRepository(options.db);
  const hub = new GameHub();

  /**
   * Which game's rules a row plays by (roadmap C1) — read from its `game_type` column.
   *
   * This is the lookup C0 couldn't do: a `games` row is an id and an opaque blob, so without the
   * column the server had to refuse to boot with more than one game registered rather than risk
   * handing one game's state to another's engine. With it, hosting a second game is just registering
   * one. **Every route resolves the module from the row, never from a default** — that's what keeps
   * a game's state and its rules together.
   *
   * `undefined` for an unknown game *or* for a row whose type is no longer registered (a module
   * removed while its games remain). Callers must handle both; the difference is what they tell the
   * client (404 vs 409).
   */
  const moduleOf = (gameId: string): AnyGameModule | undefined => {
    const gameType = repo.typeOf(gameId);
    return gameType === undefined ? undefined : registry.get(gameType);
  };

  /** Same, for the paths that can't be reached without a valid module (pushes, ticks). */
  const moduleFor = (gameId: string): AnyGameModule => {
    const module = moduleOf(gameId);
    if (!module) throw new Error(`Game "${gameId}" has no registered module (type "${repo.typeOf(gameId)}")`);
    return module;
  };

  /**
   * The game a bare `POST /games` creates when the caller names no type. Keeps the hotseat quick-start
   * working; C2's picker sends an explicit `gameType`, and any client may already.
   */
  const defaultGameType = options.defaultGameType ?? DEFAULT_GAME_ID;

  /** Injected randomness (seedable in tests). Used for setup shuffles and per-action rolls alike. */
  const rng = options.rng ?? Math.random;

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
    try {
      drivers.get(moduleFor(gameId).id)?.tick(gameId);
    } catch (error) {
      // A bot that can't produce a legal move — or a runner that trips its runaway guard — must stall
      // its own seat, never take the game down. `tick` runs on `GET /games/:id` and WS subscribe as
      // well as on writes, so an uncontained throw here would 500 *every future read* of the game, and
      // no human could unstick it (it isn't their turn). Contain it: log, and leave the seat unadvanced
      // so a human can still load the board. The bug this guards is invisible until a rules change makes
      // a policy's assumption false, because the invariant keeping bots safe lives in a different package.
      app.log.error({ err: error, gameId }, 'bot driver failed; stalling AI seat');
    }
  };

  /**
   * Broadcast new state to every client, each projected for its own seat(s), then let the module push
   * any side-channel of its own (Container: the pending auction). The one way to say "a game moved".
   */
  const pushGame = (gameId: string, state: unknown): void => {
    const module = moduleFor(gameId);
    // The hub is a dumb fan-out: it knows nothing about game state, so *we* say what each viewer sees.
    hub.broadcastEach(gameId, (viewer) => stateMessage(module, gameId, state, viewer));
    module.onStateChanged?.(state, contexts.get(module.id)!);
  };

  /** The `{ type: 'state' }` push, projected for one subscriber. */
  const stateMessage = (module: AnyGameModule, gameId: string, state: unknown, viewer: Viewer): StateMessage => {
    const summary = module.summarize(state);
    return {
      type: 'state',
      // A null viewer follows whoever is active (a shared hotseat screen shows the current player); a
      // seat list projects for exactly those seats; an empty list is a spectator (sees no cards).
      game: module.viewFor(state, viewer ?? summary.activePlayerId),
      gameType: module.id,
      bots: botSeats.listForGame(gameId),
      // Each seat's chosen colour (playerId → palette id). Beside the game like `bots`, never inside it.
      colors: colorsFor(module, gameId, state),
      // Secret-free seat identity, so the shell can name seats and gate turns without reading `game`.
      players: summary.players,
      activePlayerId: summary.activePlayerId,
    };
  };

  /** `?viewer=p1,p3` ⇒ those seats; omitted ⇒ follow the active player (hotseat); `?viewer=` ⇒ none. */
  const viewerFrom = (raw: string | undefined, module: AnyGameModule, state: unknown): Viewer =>
    raw !== undefined ? raw.split(',').filter(Boolean) : module.summarize(state).activePlayerId;

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

  /**
   * The game's `game_type` names a module this server doesn't have — someone pulled a game out of the
   * registry while its rows remained. 409 rather than 404: the game exists, we just can't play it.
   */
  const unknownType = (reply: FastifyReply, id: string) =>
    reply.code(409).send({
      error: {
        code: 'GAME_TYPE_UNAVAILABLE',
        message: `Game "${id}" is a "${repo.typeOf(id)}" game, which this server does not host`,
      },
    });

  /**
   * The row was saved at a schema version newer than the module that owns it — the server is behind the
   * data (REVIEW §4.1). Same family as `GAME_TYPE_UNAVAILABLE`: the game exists, we just can't safely
   * read it here, so 409 rather than 404. The fix is deploying a server new enough to know the shape.
   */
  const schemaUnsupported = (reply: FastifyReply, id: string) =>
    reply.code(409).send({
      error: {
        code: 'GAME_SCHEMA_UNSUPPORTED',
        message: `Game "${id}" was saved by a newer version of this server and cannot be loaded until it is updated`,
      },
    });

  /** You asked one game's endpoint about another game's row. 404 — that endpoint has no such game. */
  const wrongType = (reply: FastifyReply, id: string, moduleId: string) =>
    reply.code(404).send({
      error: {
        code: 'WRONG_GAME_TYPE',
        message: `Game "${id}" is not a "${moduleId}" game`,
      },
    });

  /**
   * Resolve a game and the module that owns it, in one place, or reply and return null.
   *
   * Every route needs both, and they must come from the same row — the whole point of C1 is that a
   * game's state and its rules are never chosen independently.
   */
  const load = (reply: FastifyReply, id: string): { state: unknown; module: AnyGameModule } | null => {
    if (!repo.exists(id)) {
      void notFound(reply, id);
      return null;
    }
    const module = moduleOf(id);
    if (!module) {
      void unknownType(reply, id);
      return null;
    }
    // Resolve the module *before* reading the state, so a stale-schema row is migrated by its own
    // module (or refused if it's from a newer server) as it loads — every core read goes through here.
    try {
      const state = repo.get(module, id);
      if (state === undefined) {
        void notFound(reply, id);
        return null;
      }
      return { state, module };
    } catch (error) {
      if (error instanceof SchemaUnsupportedError) {
        void schemaUnsupported(reply, id);
        return null;
      }
      throw error;
    }
  };

  /**
   * The colour every seat holds, reading the stored picks and synthesising palette-order defaults for
   * any seat without one — from the *module's* palette and `summarize`, so the core still reads no
   * field off game state. Old games (no `game_colors` rows) come back fully coloured, so no payload
   * path ever sees a colourless seat.
   */
  const colorsFor = (module: AnyGameModule, gameId: string, state: unknown): Record<string, string> =>
    colorsForSeats(
      module.colors,
      module.summarize(state).players.map((player) => player.id),
      colorSeats.listForGame(gameId),
    );

  /**
   * Reject a per-seat colour list on create (`POST /games`) that names a colour outside the game's
   * palette (`INVALID_COLOR`, 400) or picks the same colour for two seats (`COLOR_TAKEN`, 409).
   *
   * The same two failures the lobby's `rejectColor` guards, but over a whole list at once rather than
   * one seat against the others — the hotseat quick-start hands every seat's pick up front. Unpicked
   * seats (`undefined`) are skipped, so a colour-less create is a no-op here and keeps today's default
   * assignment byte-identical. Returns the sent reply to reject, or `null` to accept. `assignColors`
   * would *silently* drop a bad pick; on the explicit create path we say so instead.
   */
  const rejectColorPicks = (
    reply: FastifyReply,
    palette: readonly string[],
    picks: readonly (string | undefined)[],
  ): FastifyReply | null => {
    const seen = new Set<string>();
    for (const pick of picks) {
      if (pick === undefined) continue;
      if (!palette.includes(pick)) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_COLOR', message: `"${pick}" is not a colour in this game` } });
      }
      if (seen.has(pick)) {
        return reply.code(409).send({ error: { code: 'COLOR_TAKEN', message: `Colour "${pick}" is already taken` } });
      }
      seen.add(pick);
    }
    return null;
  };

  /**
   * Reject a bot-difficulty pick a game doesn't allow (CS4). A tier may be set only on a **bot** seat,
   * must be one the module declares in `botDifficulties`, and cannot appear at all for a game that
   * declares none — all `400 INVALID_DIFFICULTY`. An unset tier is always fine (the seat stores the
   * `'normal'` default), so a game with no difficulty concept is completely unaffected. Returns the
   * sent reply to reject, or `null` to accept. `tiers` is the module's declared list (or `undefined`).
   */
  const rejectDifficulty = (
    reply: FastifyReply,
    tiers: readonly string[] | undefined,
    difficulty: string | undefined,
    isBot: boolean,
  ): FastifyReply | null => {
    if (difficulty === undefined) return null;
    if (!isBot) {
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_DIFFICULTY', message: 'Only a bot seat can have a difficulty' } });
    }
    if (!tiers?.includes(difficulty)) {
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_DIFFICULTY', message: `"${difficulty}" is not a difficulty in this game` } });
    }
    return null;
  };

  /** The whole-list form of `rejectDifficulty` for `POST /games` (every seat's pick at once). */
  const rejectDifficultyPicks = (
    reply: FastifyReply,
    tiers: readonly string[] | undefined,
    seats: readonly NewSeat[],
  ): FastifyReply | null => {
    for (const seat of seats) {
      if (rejectDifficulty(reply, tiers, seat.difficulty, seat.bot === true)) return reply;
    }
    return null;
  };

  /** Deal a new game of one type and record which of its seats an AI holds and each seat's colour. */
  const startGame = (module: AnyGameModule, seats: readonly NewSeat[]): unknown => {
    const state = module.createGame({
      id: randomUUID(),
      players: seats.map((seat) => ({ name: seat.name })),
      // Randomness is injected, never reached for inside a module — that is what keeps every engine
      // pure, deterministic and replayable.
      rng,
    });
    // Stamps `game_type` from the module, which is what lets every later request find its way back
    // to these rules.
    repo.create(module, state);

    const { id: gameId, players } = module.summarize(state);
    // Seat i is always the i-th player (see createGame), so a seat's bot flag maps straight to an id.
    // Recorded outside the game state — the engine never learns which seats are bots (nor their
    // difficulty, CS4). A seat with no explicit tier stores 'normal' (BotRepository's default).
    const botEntries = players
      .map((player, seat) => ({ id: player.id, difficulty: seats[seat]?.difficulty }))
      .filter((_, seat) => seats[seat]?.bot === true);
    if (botEntries.length > 0) botSeats.setForGame(gameId, botEntries);

    // Assign colours: honour each seat's pick, fill the rest with the first free palette colour in
    // order (so a table with no picks reproduces today's seat-order tints — visual baselines hold).
    const assigned = assignColors(
      module.colors,
      seats.map((seat) => seat.color),
    );
    colorSeats.setForGame(gameId, Object.fromEntries(players.map((player, seat) => [player.id, assigned[seat]!])));

    // A bot in an early seat should already have played by the time anyone sees the board.
    tick(gameId);
    return repo.get(module, gameId) ?? state;
  };

  /**
   * The `{ game, gameType, bots }` payload every state-returning route replies with.
   *
   * `gameType` rides along because a game view is an opaque blob to anyone generic: a client that
   * hosts more than one game (roadmap C2's shell) has no other way to know which board to render for
   * a state it just fetched. Same reason the column exists server-side.
   *
   * `players` / `activePlayerId` ride along too (REVIEW §3.3), from the module's `summarize` — the
   * secret-free seat identity the shell needs for the tab title, rematch, and seat binding without
   * duck-typing the opaque `game`. The core still reads no field off game state; the module supplies it.
   */
  const gamePayload = (module: AnyGameModule, gameId: string, state: unknown, viewer: Viewer) => {
    const summary = module.summarize(state);
    return {
      game: module.viewFor(state, viewer),
      gameType: module.id,
      bots: botSeats.listForGame(gameId),
      colors: colorsFor(module, gameId, state),
      players: summary.players,
      activePlayerId: summary.activePlayerId,
    };
  };

  // `maxPayload` (§4.7): the stream is push-only, so a client legitimately sends no data frames at all
  // — a small inbound cap rejects anything a misbehaving or hostile peer tries to push up the socket.
  app.register(fastifyWebsocket, { options: { maxPayload: WS_MAX_PAYLOAD } });

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

  /**
   * Liveness **and** readiness: actually touch the database with a cheap `SELECT 1`, so the compose
   * healthcheck (and `restart: unless-stopped`) can fire when the `/data` volume is unmounted, the
   * file is locked, or the handle is closed. The old constant `{ status: 'ok' }` proved only that the
   * event loop was alive — a database that had vanished still read as healthy (REVIEW §4.4). Kept
   * fast because it's polled every 30s. 503 on failure so `fetch(...).ok` in the compose check is false.
   */
  app.get('/health', async (_request, reply) => {
    try {
      options.db.prepare('SELECT 1').get();
      return { status: 'ok' };
    } catch (error) {
      app.log.error({ err: error }, 'health check failed: database unreachable');
      return reply.code(503).send({ status: 'unhealthy' });
    }
  });

  /** The games this site can host — what C2's picker lists. */
  app.get('/games/catalog', async () => ({ games: registry.list() }));

  // Live game stream. A client connects, gets an immediate snapshot, then receives a push on every
  // state change — each projected for `?viewer=<id>` (omit to follow the active player, for hotseat).
  app.register(async (instance) => {
    instance.get<{ Params: { id: string }; Querystring: { viewer?: string } }>(
      '/games/:id/stream',
      { websocket: true },
      (socket, request) => {
        // WS is exempt from CORS (§4.7): without an origin check any page a LAN user visits could open
        // this socket and read their projected state. Refuse a cross-origin upgrade — same-origin and
        // non-browser (no Origin) clients pass, plus any configured `allowedOrigins`.
        if (!isAllowedWsOrigin(request.headers.origin, request.headers.host, allowedOrigins)) {
          socket.close(1008, 'Cross-origin WebSocket connections are not allowed');
          return;
        }
        // Per-IP concurrent-connection cap (§4.7): one tab opens one socket, so a flood is abuse.
        const ip = request.ip;
        if (!wsConnections.tryAcquire(ip)) {
          socket.close(1013, 'Too many concurrent connections'); // 1013 = Try Again Later
          return;
        }
        // Release on 'error' as well as 'close': a proxy reset (the Vite dev proxy's documented
        // ECONNRESET under load) can error a socket without a clean close, and the deferred WS
        // heartbeat means nothing else reaps it — an orphan would then count against the IP forever.
        // `release` is idempotent per acquire only if called once, so guard against double-fire.
        let released = false;
        const releaseOnce = () => {
          if (!released) {
            released = true;
            wsConnections.release(ip);
          }
        };
        socket.on('close', releaseOnce);
        socket.on('error', releaseOnce);
        const module = moduleOf(request.params.id);
        if (!module) {
          socket.close(1008, `No game with id "${request.params.id}"`);
          return;
        }
        let state: unknown;
        try {
          state = repo.get(module, request.params.id);
        } catch (error) {
          if (error instanceof SchemaUnsupportedError) {
            socket.close(1011, 'Game was saved by a newer version of this server');
            return;
          }
          throw error;
        }
        if (state === undefined) {
          socket.close(1008, `No game with id "${request.params.id}"`);
          return;
        }
        // No `?viewer` ⇒ follow the active player; `?viewer=p1,p3` ⇒ those seats; `?viewer=` ⇒ spectator.
        const viewer = request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : null;
        const unsubscribe = hub.subscribe(request.params.id, socket, viewer);
        socket.on('close', unsubscribe);
        tick(request.params.id); // a watching client is enough to drive stalled bot turns
        // Send the first snapshot on the next tick, after the open handshake settles, so a client
        // that attaches its message handler right after connecting never misses it.
        setImmediate(() => hub.send(socket, stateMessage(module, request.params.id, state, viewer)));
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
            // Which game to deal. Optional: a bare POST still starts the default (the hotseat
            // quick-start posts no type), while C2's picker names one explicitly.
            gameType: { type: 'string', minLength: 1, maxLength: MAX_GAME_TYPE_LENGTH },
            players: {
              type: 'array',
              // Bounded (§4.7): above any module's max seats (5 today), so no game is constrained, but
              // a hostile list of thousands of seats can't be stored in the state JSON.
              maxItems: MAX_SEATS,
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  // Bounded (§4.7): an unbounded name is stored in state JSON and echoed on every poll.
                  name: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH },
                  // A player-colour pick (a palette id). Honoured if valid/unique, else defaulted.
                  color: { type: 'string' },
                  bot: { type: 'boolean' },
                  // A bot seat's difficulty tier (CS4), validated against the game's declared tiers.
                  difficulty: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const gameType = request.body.gameType ?? defaultGameType;
      const module = registry.get(gameType);
      if (!module) {
        return reply.code(400).send({
          error: { code: 'UNKNOWN_GAME_TYPE', message: `This server does not host a game called "${gameType}"` },
        });
      }
      // Validate each seat's colour pick against this game's palette (invalid → 400) and for duplicates
      // (→ 409), rather than let `assignColors` quietly default a bad pick. An absent/all-unpicked list
      // passes untouched, so a colour-less create still behaves exactly as it did before this feature.
      if (
        rejectColorPicks(
          reply,
          module.colors,
          request.body.players.map((seat) => seat.color),
        )
      )
        return reply;
      // Validate each bot seat's difficulty against this game's declared tiers (CS4). A game with no
      // tiers rejects any difficulty at all; an unset tier always passes.
      if (rejectDifficultyPicks(reply, module.botDifficulties, request.body.players)) return reply;
      try {
        const started = startGame(module, request.body.players);
        const gameId = module.summarize(started).id;
        return reply.code(201).send(gamePayload(module, gameId, started, module.summarize(started).activePlayerId));
      } catch (error) {
        return sendGameError(reply, module, error);
      }
    },
  );

  // In-progress games, for the home-screen "resume" list. Summaries only — no secret scoring cards.
  // Abandoned games are excluded — that's what abandoning one is for.
  app.get('/games', async () => ({ games: repo.listActive((gameType) => registry.get(gameType)) }));

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
    if (!repo.exists(request.params.id)) return notFound(reply, request.params.id);
    repo.abandon(request.params.id);
    // Tell anyone still watching, so a client sitting on the board finds out rather than discovering
    // it on its next rejected move.
    hub.broadcastEach(request.params.id, () => ({ type: 'abandoned', gameId: request.params.id }));
    return reply.send({ abandoned: true });
  });

  /**
   * Propose or accept a **rematch** of a finished game — play again with the same players.
   *
   * Game-agnostic, like abandon: a rematch is "start another game with the same seats", which is true
   * of every game, so it lives in the core with no `GameModule` hook. One human proposes, another
   * agrees, and a fresh game of the same type starts with the same seats **and** bot assignments; every
   * watching client is pushed the new game's id and navigates to it.
   *
   * `controlledIds` is the caller's own seats (`null` ⇒ hotseat, one device drives everyone). The
   * server resolves those to human seats and needs **two distinct** to agree before starting — a lone
   * human vs bots needs only itself, and an all-bot table anyone watching can restart in one click.
   * Not seat-authenticated, like every other action here (trusted-LAN use).
   */
  app.post<{ Params: { id: string }; Body: { controlledIds?: readonly string[] | null } }>(
    '/games/:id/rematch',
    {
      schema: {
        body: {
          type: 'object',
          properties: { controlledIds: { type: ['array', 'null'], items: { type: 'string' } } },
        },
      },
    },
    async (request, reply) => {
      const loaded = load(reply, request.params.id);
      if (!loaded) return reply;
      const { state, module } = loaded;

      const summary = module.summarize(state);
      if (summary.status !== 'ended') {
        return reply
          .code(409)
          .send({ error: { code: 'REMATCH_NOT_READY', message: 'A rematch can only start once the game has ended' } });
      }

      const botIds = new Set(botSeats.listForGame(request.params.id));
      const humanSeats = summary.players.map((p) => p.id).filter((id) => !botIds.has(id));

      const existing = rematches.get(request.params.id);
      // Already started — hand the new game id to a late caller so it navigates too (idempotent).
      if (existing?.newGameId) return reply.send({ rematch: existing });

      // `null`/omitted ⇒ hotseat: this device drives every seat, so it agrees for all human seats.
      const requested = request.body?.controlledIds;
      const agreeing = requested == null ? humanSeats : requested.filter((id) => humanSeats.includes(id));
      const agreed = [...new Set([...(existing?.agreed ?? []), ...agreeing])];

      // Two distinct humans must agree (proposer + accepter); one human vs bots needs only itself; an
      // all-bot table (no humans) can be restarted by anyone watching.
      const threshold = humanSeats.length === 0 ? 0 : Math.min(2, humanSeats.length);
      let newGameId: string | null = null;
      if (agreed.length >= threshold) {
        // Carry colours and bot difficulties over too, the same way bot assignments carry: the rematch
        // is the same table (CS4).
        const oldColors = colorSeats.listForGame(request.params.id);
        const oldDifficulties = botSeats.difficultiesForGame(request.params.id);
        const seats: NewSeat[] = summary.players.map((p) => ({
          name: p.name,
          bot: botIds.has(p.id),
          ...(oldColors[p.id] !== undefined ? { color: oldColors[p.id] } : {}),
          ...(botIds.has(p.id) && oldDifficulties[p.id] !== undefined ? { difficulty: oldDifficulties[p.id] } : {}),
        }));
        newGameId = module.summarize(startGame(module, seats)).id;
      }

      const rematch: Rematch = { gameId: request.params.id, agreed, newGameId };
      rematches.save(rematch, new Date().toISOString());
      // Everyone watching the finished game hears it: a proposal lights up "Accept", a start sends them
      // all to `newGameId`.
      hub.broadcastEach(request.params.id, () => ({ type: 'rematch', agreed, newGameId }));
      return reply.send({ rematch });
    },
  );

  /** The current rematch proposal for a game (for a client entering an already-finished game). */
  app.get<{ Params: { id: string } }>('/games/:id/rematch', async (request, reply) => {
    if (!repo.exists(request.params.id)) return notFound(reply, request.params.id);
    const rematch = rematches.get(request.params.id) ?? {
      gameId: request.params.id,
      agreed: [],
      newGameId: null,
    };
    return reply.send({ rematch });
  });

  app.get<{ Params: { id: string }; Querystring: { viewer?: string } }>('/games/:id', async (request, reply) => {
    const loaded = load(reply, request.params.id);
    if (!loaded) return reply;
    // Looking at a game is enough to drive it. Bot turns are normally played by whatever mutation
    // preceded them, but nothing mutates while it is *already* a bot's move — after a restart, or a
    // game seeded any other way, the AI would sit there forever and no human could unstick it,
    // because it isn't their turn. Ticking on read makes that self-healing; it's a no-op with no
    // bots, or when a human is on the clock.
    tick(request.params.id);
    const { module } = loaded;
    // Re-read: the bots may have moved it on since `load` (which already migrated the row).
    const state = repo.get(module, request.params.id)!;
    return reply.send({
      ...gamePayload(module, request.params.id, state, viewerFrom(request.query.viewer, module, state)),
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
            // Optimistic concurrency (§4.2): the client's known version. Optional — absent ⇒ today's
            // unconditional apply, so the field is backward-compatible.
            expectedVersion: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      // Abandonment is already refused by the preHandler above, before we get here.
      const loaded = load(reply, request.params.id);
      if (!loaded) return reply;
      const { state, module } = loaded;

      // Optimistic concurrency (§4.2): if the client told us the version it acted against and the game
      // has since moved on, refuse rather than apply to a state the client never saw. This is what
      // makes a double-click / stale second device a no-op — the UI refetches on this code, not errors.
      const loadedVersion = module.versionOf(state);
      const expected = request.body.expectedVersion;
      if (expected !== undefined && expected !== loadedVersion) {
        return reply.code(409).send({
          error: {
            code: 'STALE_VERSION',
            message: `Game is at version ${loadedVersion}, not ${expected}; reload before acting`,
          },
        });
      }

      const parsed = module.parseAction(request.body.action);
      if (!parsed.ok) return badRequest(reply, parsed.message);

      // The module may own this action through a flow of its own (Container's delivery auction
      // collects sealed bids server-side), in which case `/actions` is the wrong door.
      const pending = module.pendingStep?.(state, parsed.action);
      if (pending) return sendError(reply, pending);

      try {
        // ⚠️ Load → apply → update is race-free **only because this stretch is synchronous**:
        // better-sqlite3 is synchronous and there is no `await` between `load` (above) and
        // `repo.update` (below), so two concurrent POSTs cannot interleave a read and a write. Do NOT
        // add an `await` into this block — a single one silently opens a lost-update / double-apply
        // race (a double-click applying the same action twice). The `WHERE version = ?` guard threaded
        // below (§4.2) is the backstop that would catch such a race, refusing the second write with
        // `StaleVersionError` rather than clobbering the first; keep this stretch synchronous anyway.
        const next = module.applyAction(state, request.body.playerId, parsed.action);
        repo.update(module, next, loadedVersion);
        pushGame(request.params.id, next); // tell every connected client
        // Let the AI take any seats that are now on the clock, before we reply — so the caller gets
        // back the state as it stands once the bots have finished, not a snapshot mid-round.
        tick(request.params.id);
        // Read back rather than replying with `next`: the bots may have played several turns since.
        const settled = repo.get(module, request.params.id) ?? next;
        // Project the reply for the acting client's own seats (not the active player), so ending a
        // turn never leaks the next player's card. No `?viewer` ⇒ follow the active player (hotseat).
        return reply.send(
          gamePayload(module, request.params.id, settled, viewerFrom(request.query.viewer, module, settled)),
        );
      } catch (error) {
        // The `WHERE version` backstop fired: a concurrent write beat this one. Same client-facing
        // contract as the pre-check above — 409 STALE_VERSION, so the UI refetches rather than erroring.
        if (error instanceof StaleVersionError) {
          return reply.code(409).send({
            error: { code: 'STALE_VERSION', message: error.message },
          });
        }
        return sendGameError(reply, module, error);
      }
    },
  );

  // Give every registered game its context, its AI driver, and its own endpoints — Container's
  // delivery auction being the one that exists. The core knows nothing about what they do.
  for (const info of registry.list()) {
    const module = registry.require(info.id);
    const ctx: ModuleContext = {
      db: options.db,
      // Bound to this module, so it can persist its own state without naming itself.
      games: {
        get: (gameId) => repo.get(module, gameId),
        // Unconditional overwrite (no `expectedVersion`): a module route re-reads and re-applies inside
        // one synchronous span (Container's auction resolve, Can't Stop / Stone Age roll), so there is
        // no interleaving window the version guard would protect — and adding it would only invent a
        // false-conflict failure mode. The core's `/actions` handler is the one that threads the guard.
        update: (state) => repo.update(module, state),
      },
      botSeats,
      hub,
      rng,
      pushGame,
      // A getter, because the driver below is built *from* this context.
      get bots(): BotDriver {
        return drivers.get(module.id) ?? noBots;
      },
      colorsFor: (gameId, state) => colorsFor(module, gameId, state),
    };
    contexts.set(module.id, ctx);
    const driver = module.createBotDriver?.(ctx);
    if (driver) drivers.set(module.id, driver);

    /**
     * Each game's routes live under `/games/:id/<gameType>/…`, so a module declares paths relative to
     * that (Container's `routes.ts` registers `/auction`, serving `/games/:id/container/auction`).
     *
     * Namespacing is about **correctness, not just collisions**. Unprefixed, two games both wanting an
     * `/auction` endpoint would be a Fastify duplicate-route crash at boot — but worse, whichever
     * registered first would then be handed *every* game's auction requests, including games it has no
     * business interpreting. Auctions are common in board games; this is a when-not-if problem.
     *
     * The guard closes the other half: a prefix is just a URL, and nothing stops a client asking for
     * `/games/<a-chess-game>/container/auction`. Refusing anything whose row isn't this module's type
     * means a module can only ever be handed its own states — the same guarantee `moduleFor` gives the
     * core routes.
     */
    app.register(
      async (scope) => {
        scope.addHook('preHandler', async (request, reply) => {
          const gameId = (request.params as { id?: string }).id;
          if (gameId === undefined) return;
          if (!repo.exists(gameId)) return notFound(reply, gameId);
          if (repo.typeOf(gameId) !== module.id) return wrongType(reply, gameId, module.id);
          // Migrate on the module-route path too (only *after* the type guard, so a wrong-type row is
          // never handed to this module), and refuse a row from a newer server rather than 500.
          try {
            repo.get(module, gameId);
          } catch (error) {
            if (error instanceof SchemaUnsupportedError) return schemaUnsupported(reply, gameId);
            throw error;
          }
        });
        module.routes?.(scope, ctx);
      },
      { prefix: `/games/:id/${module.id}` },
    );
  }

  // --- Lobbies: create an empty room, join by code with a name, start when every seat is filled ---

  const lobbyNotFound = (reply: FastifyReply, id: string) =>
    reply.code(404).send({ error: { code: 'LOBBY_NOT_FOUND', message: `No lobby with id "${id}"` } });

  /**
   * The colour palette a lobby offers, from its game's module (the module owns the palette, C1-style —
   * the seat range comes from the same place). Empty if the game is no longer hosted.
   */
  const paletteOf = (lobby: Lobby): readonly string[] => registry.get(lobby.gameType)?.colors ?? [];

  /** The AI difficulty tiers a lobby's game offers (CS4), or `undefined` if it declares none. */
  const difficultiesOf = (lobby: Lobby): readonly string[] | undefined => registry.get(lobby.gameType)?.botDifficulties;

  /**
   * Reject a colour pick that isn't in the palette (`INVALID_COLOR`, 400) or is already held by
   * another seat (`COLOR_TAKEN`, 409). `exceptSeat` is the seat doing the picking, so re-selecting your
   * own colour is fine. Returns the sent reply to reject, or `null` to accept.
   */
  const rejectColor = (
    reply: FastifyReply,
    palette: readonly string[],
    color: string,
    members: readonly (LobbyMember | null)[],
    exceptSeat: number,
  ): FastifyReply | null => {
    if (!palette.includes(color)) {
      return reply
        .code(400)
        .send({ error: { code: 'INVALID_COLOR', message: `"${color}" is not a colour in this game` } });
    }
    if (members.some((member, seat) => seat !== exceptSeat && member?.color === color)) {
      return reply.code(409).send({ error: { code: 'COLOR_TAKEN', message: `Colour "${color}" is already taken` } });
    }
    return null;
  };

  app.post<{ Body: { seats?: number; gameType?: string } }>(
    '/lobbies',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            seats: { type: 'number' },
            gameType: { type: 'string', minLength: 1, maxLength: MAX_GAME_TYPE_LENGTH },
          },
        },
      },
    },
    async (request, reply) => {
      const gameType = request.body?.gameType ?? defaultGameType;
      const module = registry.get(gameType);
      if (!module) {
        return reply.code(400).send({
          error: { code: 'UNKNOWN_GAME_TYPE', message: `This server does not host a game called "${gameType}"` },
        });
      }
      // The seat range is the *chosen game's*, not a constant — Container's 3–5 is Container's rule.
      const { minPlayers, maxPlayers } = module;
      const seats = request.body?.seats ?? minPlayers;
      if (!Number.isInteger(seats) || seats < minPlayers || seats > maxPlayers) {
        return reply
          .code(400)
          .send({ error: { code: 'INVALID_SEAT_COUNT', message: `Seats must be ${minPlayers}–${maxPlayers}` } });
      }
      const lobby: Lobby = {
        id: randomUUID(),
        gameType,
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

  app.post<{ Params: { id: string }; Body: { name: string; bot?: boolean; color?: string; difficulty?: string } }>(
    '/lobbies/:id/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            // Bounded (§4.7): the claimed name is persisted and echoed to every waiting-room poll.
            name: { type: 'string', minLength: 1, maxLength: MAX_NAME_LENGTH },
            bot: { type: 'boolean' },
            // Optional colour pick, validated against this game's palette + the other seats' picks.
            color: { type: 'string' },
            // Optional bot-difficulty tier (CS4), validated against this game's declared tiers.
            difficulty: { type: 'string' },
          },
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
      const color = request.body.color;
      if (color !== undefined && rejectColor(reply, paletteOf(lobby), color, lobby.members, seat)) return reply;
      const isBot = request.body.bot === true;
      const difficulty = request.body.difficulty;
      if (rejectDifficulty(reply, difficultiesOf(lobby), difficulty, isBot)) return reply;
      const claimed: LobbyMember = {
        name: request.body.name.trim(),
        bot: isBot,
        ...(color !== undefined ? { color } : {}),
        ...(difficulty !== undefined ? { difficulty } : {}),
      };
      const members = lobby.members.map((member, i) => (i === seat ? claimed : member));
      const updated: Lobby = { ...lobby, members };
      lobbies.update(updated);
      return reply.send({ lobby: updated, seat });
    },
  );

  /**
   * Change a seat's colour while waiting in the lobby (the waiting room polls, so a re-pick shows up
   * live for everyone). Seats aren't authenticated — the client names the seat it's changing, the same
   * trusted-LAN bargain as resuming a game or rejoining a lobby. The pick is validated against the
   * palette + the other seats, so two seats can't end up the same colour.
   */
  app.post<{ Params: { id: string }; Body: { seat: number; color: string } }>(
    '/lobbies/:id/color',
    {
      schema: {
        body: {
          type: 'object',
          required: ['seat', 'color'],
          properties: { seat: { type: 'number' }, color: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const lobby = lobbies.get(request.params.id);
      if (!lobby) return lobbyNotFound(reply, request.params.id);
      if (lobby.status !== 'open') {
        return reply.code(409).send({ error: { code: 'LOBBY_STARTED', message: 'This game has already started' } });
      }
      const { seat, color } = request.body;
      const member = lobby.members[seat];
      if (!Number.isInteger(seat) || seat < 0 || seat >= lobby.members.length || !member) {
        return reply.code(409).send({ error: { code: 'SEAT_NOT_CLAIMED', message: `Seat ${seat} is not claimed` } });
      }
      if (rejectColor(reply, paletteOf(lobby), color, lobby.members, seat)) return reply;
      const members = lobby.members.map((existing, i) => (i === seat ? { ...member, color } : existing));
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
    // The lobby chose its game when it was created; a module removed since then is the one way this
    // can fail, and it should say so rather than deal the wrong game.
    const module = registry.get(lobby.gameType);
    if (!module) {
      return reply.code(409).send({
        error: {
          code: 'GAME_TYPE_UNAVAILABLE',
          message: `This lobby is for "${lobby.gameType}", which this server does not host`,
        },
      });
    }
    try {
      const members = lobby.members as LobbyMember[];
      const started = startGame(
        module,
        members.map((member) => ({
          name: member.name,
          bot: member.bot,
          color: member.color,
          difficulty: member.difficulty,
        })),
      );
      const gameId = module.summarize(started).id;
      lobbies.update({ ...lobby, status: 'started', gameId });
      return reply.code(201).send(gamePayload(module, gameId, started, module.summarize(started).activePlayerId));
    } catch (error) {
      return sendGameError(reply, module, error);
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
