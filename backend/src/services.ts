import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { defaultTableOptions, resolveTableOptions } from '@game-hub/kernel';
import type { TableOptions } from '@game-hub/kernel';
import { BotRepository } from './bots';
import { ChatRepository } from './chat';
import { ColorRepository, assignColors, colorsForSeats } from './colors';
import type { DB } from './db';
import { createDefaultRegistry, DEFAULT_GAME_ID } from './games';
import type { AnyGameModule, BotDriver, ErrorResponse, ModuleContext, Viewer } from './games';
import { GameRegistry } from './games';
import { GameHub } from './hub';
import type { StateMessage } from './hub';
import { RematchRepository } from './rematch';
import { LobbyRepository } from './lobbies';
import { GameRepository, SchemaUnsupportedError } from './repository';
import { WsConnectionLimiter } from './security';

/**
 * `NewSeat` is a name plus a per-seat AI flag and optional colour pick. `bot` is stripped before the
 * engine ever sees the seat — the engine must never learn which seats an AI holds. `color` is **not**
 * stripped any more (kernel 1.2.0): the resolved pick is handed to `createGame`, because a game may
 * treat its colour as rules data. It stays coordination state here regardless — stored beside the
 * game, and never read back out of it.
 */
export interface NewSeat {
  name: string;
  bot?: boolean;
  color?: string;
  /** For a bot seat, the difficulty tier it plays by (CS4). Validated against the game's declared tiers. */
  difficulty?: string;
}

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
 * The shared innards every route group is built on — the repositories, the live-stream hub, and the
 * game-lifecycle + error-reply helpers that used to be closures inside `buildApp`. Extracted so the
 * route registrars (games, lobbies, rematch, abandon, stream, modules, static) can each live in their
 * own file while still sharing one set of helpers (roadmap "app.ts is the file that grew back"). Every
 * field is game-agnostic by intent: the helpers defer every *rule* to the row's `GameModule`.
 */
export interface AppServices {
  readonly db: DB;
  readonly registry: GameRegistry;
  readonly repo: GameRepository;
  readonly lobbies: LobbyRepository;
  readonly botSeats: BotRepository;
  readonly colorSeats: ColorRepository;
  readonly rematches: RematchRepository;
  /** The append-only, game-scoped chat log (coordination state, table-public — see `chat.ts`). */
  readonly chats: ChatRepository;
  readonly hub: GameHub;
  readonly wsConnections: WsConnectionLimiter;
  readonly allowedOrigins: readonly string[];
  readonly rng: () => number;
  readonly defaultGameType: string;
  /** Per-module AI drivers and contexts, populated by the module-routes registrar and read by `tick`. */
  readonly drivers: Map<string, BotDriver>;
  readonly contexts: Map<string, ModuleContext>;
  readonly noBots: BotDriver;

  moduleOf(gameId: string): AnyGameModule | undefined;
  moduleFor(gameId: string): AnyGameModule;
  tick(gameId: string): void;
  pushGame(gameId: string, state: unknown): void;
  stateMessage(module: AnyGameModule, gameId: string, state: unknown, viewer: Viewer): StateMessage;
  viewerFrom(raw: string | undefined, module: AnyGameModule, state: unknown): Viewer;
  colorsFor(module: AnyGameModule, gameId: string, state: unknown): Record<string, string>;
  load(reply: FastifyReply, id: string): { state: unknown; module: AnyGameModule } | null;
  startGame(module: AnyGameModule, seats: readonly NewSeat[], options?: TableOptions): unknown;
  gamePayload(module: AnyGameModule, gameId: string, state: unknown, viewer: Viewer): Record<string, unknown>;

  sendError(reply: FastifyReply, mapped: ErrorResponse): FastifyReply;
  sendGameError(reply: FastifyReply, module: AnyGameModule, error: unknown): FastifyReply;
  badRequest(reply: FastifyReply, message: string): FastifyReply;
  notFound(reply: FastifyReply, id: string): FastifyReply;
  abandoned(reply: FastifyReply, id: string): FastifyReply;
  unknownType(reply: FastifyReply, id: string): FastifyReply;
  schemaUnsupported(reply: FastifyReply, id: string): FastifyReply;
  wrongType(reply: FastifyReply, id: string, moduleId: string): FastifyReply;
  rejectColorPicks(
    reply: FastifyReply,
    palette: readonly string[],
    picks: readonly (string | undefined)[],
  ): FastifyReply | null;
  rejectDifficulty(
    reply: FastifyReply,
    tiers: readonly string[] | undefined,
    difficulty: string | undefined,
    isBot: boolean,
  ): FastifyReply | null;
  rejectDifficultyPicks(
    reply: FastifyReply,
    tiers: readonly string[] | undefined,
    seats: readonly NewSeat[],
  ): FastifyReply | null;
  tableOptionsOrReject(
    reply: FastifyReply,
    module: AnyGameModule,
    picks: Readonly<Record<string, unknown>> | undefined,
  ): TableOptions | null;
}

/**
 * Build the shared services `buildApp` and its route registrars run on. Pure factory — creates
 * repositories and closures over them, registers no routes and starts no timers (the composition root
 * in `app.ts` owns that). `app` is only needed so the helpers can log through `app.log`.
 */
export function buildServices(app: FastifyInstance, options: AppOptions): AppServices {
  const allowedOrigins = options.allowedOrigins ?? [];
  // Per-IP cap on concurrent live-stream sockets (§4.7); the hub's room map is otherwise unbounded.
  const wsConnections = new WsConnectionLimiter(options.wsMaxConnectionsPerIp);
  const registry = options.registry ?? createDefaultRegistry();
  const repo = new GameRepository(options.db);
  const lobbies = new LobbyRepository(options.db);
  const botSeats = new BotRepository(options.db);
  // Which colour each seat picked — coordination state beside the game, like bot seats (see colors.ts).
  const colorSeats = new ColorRepository(options.db);
  const rematches = new RematchRepository(options.db);
  // In-game chat log — coordination state beside the game, like bots and rematches (see chat.ts).
  const chats = new ChatRepository(options.db);
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

  /**
   * Validate a table's rule-variant picks against what the module declares (kernel 1.5.0), returning
   * the **resolved, complete** options record — or `null` after sending a `400`.
   *
   * Unlike its `rejectColorPicks`/`rejectDifficultyPicks` neighbours this returns a *value* rather than
   * just a verdict, because validating and resolving are one pass: the kernel's `resolveTableOptions`
   * fills every unpicked option with its declared default while it checks the picked ones, and running
   * it twice (once to reject, once to resolve) would be two chances for the host and the contract to
   * disagree. The rule itself lives in the kernel, not here — see `contracts/tableOptions.ts`.
   */
  const tableOptionsOrReject = (
    reply: FastifyReply,
    module: AnyGameModule,
    picks: Readonly<Record<string, unknown>> | undefined,
  ): TableOptions | null => {
    const resolved = resolveTableOptions(module.tableOptions, picks);
    if (!resolved.ok) {
      reply.code(400).send({ error: { code: 'INVALID_TABLE_OPTION', message: resolved.message } });
      return null;
    }
    return resolved.options;
  };

  /** Deal a new game of one type and record which of its seats an AI holds and each seat's colour. */
  const startGame = (module: AnyGameModule, seats: readonly NewSeat[], options?: TableOptions): unknown => {
    // Resolve every seat's colour **before** dealing: honour each pick, fill the rest with the first
    // free palette colour in order (so a table with no picks reproduces today's seat-order tints —
    // visual baselines hold). Pure and game-agnostic, so it can run this early.
    const assigned = assignColors(
      module.colors,
      seats.map((seat) => seat.color),
    );
    const state = module.createGame({
      id: randomUUID(),
      // Each seat's resolved colour rides along (kernel 1.2.0, D2c finding §16). It is still
      // *coordination* state — stored beside the game below, never read back out of it — but a game
      // where the colour **is a rule** (Labyrinth's starting corner) has no other way to learn the
      // lobby's pick, and without it such a game's colour picker would silently pick nothing. All five
      // hosted games ignore the field and deal exactly as they did before it existed.
      players: seats.map((seat, i) => ({ name: seat.name, color: assigned[i]! })),
      // The table's rule variants (kernel 1.5.0). Unlike bots and colours these are **rules data**:
      // the game folds them into its own state here and reads them from there forever after, so a
      // table's choice is frozen at the deal and replays with the game. Defaulted rather than passed
      // through as `undefined` so a caller that never touched the form (an old client, a test) still
      // deals the game's own declared defaults instead of leaving the engine to guess.
      options: options ?? defaultTableOptions(module.tableOptions),
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

    // Store the same resolved colours as coordination state, so `colorsFor` reports exactly what the
    // game was dealt with (the two can never disagree — they are one array).
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

  return {
    db: options.db,
    registry,
    repo,
    lobbies,
    botSeats,
    colorSeats,
    rematches,
    chats,
    hub,
    wsConnections,
    allowedOrigins,
    rng,
    defaultGameType,
    drivers,
    contexts,
    noBots,
    moduleOf,
    moduleFor,
    tick,
    pushGame,
    stateMessage,
    viewerFrom,
    colorsFor,
    load,
    startGame,
    gamePayload,
    sendError,
    sendGameError,
    badRequest,
    notFound,
    abandoned,
    unknownType,
    schemaUnsupported,
    wrongType,
    rejectColorPicks,
    rejectDifficulty,
    rejectDifficultyPicks,
    tableOptionsOrReject,
  };
}
