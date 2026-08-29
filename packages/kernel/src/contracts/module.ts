import type { MoveRecord } from '../moveRecord.js';
import type { TableOptions, TableOptionSpec } from './tableOptions.js';
import type { Viewer } from '../viewer.js';

/**
 * The `GameModule` seam (roadmap C0), now a **shared kernel contract** (Track D / D0).
 *
 * One typed contract every game on the site implements, so the backend can host more than one game.
 * The engine already had the right shape — a pure `state + action → state` library with a
 * serializable state and a `viewFor` redaction hook — so this mostly *names* seams that existed.
 *
 * **This contract must never import a game.** It is the interface; each `backend/src/games/<game>/`
 * is one implementation and the generated registry is the lookup. It also must never import a *host*
 * (Fastify, the DB, the hub): those are generic parameters (`Ctx`/`App`), which is what lets this
 * contract live in `@game-hub/kernel` — the neutral dependency an out-of-repo game package can build
 * against without pulling in the platform's backend. The backend re-binds the parameters to its own
 * concrete `ModuleContext`/`FastifyInstance` in `backend/src/games/module.ts`.
 *
 * ## Why `routes` and `pendingStep` exist (they are not in the original sketch)
 *
 * The roadmap's sketch was written before A1a/A2 and had no slot for the delivery auction — sealed
 * bids collected from several seats before the engine's atomic `DELIVER` can be built, with their own
 * table, their own redaction rule, their own WS message, and their own three REST endpoints. Roughly a
 * third of the old `app.ts` was that.
 *
 * We deliberately did **not** invent a generic "sealed multi-seat input" framework to hold it. That
 * abstraction would be designed off a single example, which is how you get a framework that fits one
 * game and no others. Instead a module gets somewhere to put its own weirdness: `routes` lets it
 * register endpoints the core knows nothing about, and `pendingStep` lets it tell the core "that
 * action belongs to a flow of mine, refuse it here". Container's auction stays Container-shaped — it
 * just lives inside the Container module instead of in the shared core.
 *
 * @typeParam S - the game's serializable state
 * @typeParam A - the game's client-sendable action union
 * @typeParam Ctx - the host coordination context handed to `routes`/`onStateChanged`/`createBotDriver`
 *   (the backend binds this to its `ModuleContext`; `unknown` for a host that provides none)
 * @typeParam App - the host's route registrar handed to `routes` (the backend binds `FastifyInstance`)
 */
export interface GameModule<S, A, Ctx = unknown, App = unknown> {
  /** Stable id, used as the `game_type` discriminator and in URLs. */
  readonly id: string;

  /**
   * The **kernel contract version** this game was built against (design doc §4) — declare it as
   * `kernelContract: KERNEL_CONTRACT_VERSION`, imported from the kernel the game compiled against, so
   * the number can never drift from the code. The host's registry refuses a mismatch at registration.
   *
   * Optional **during the D2a transition only**: absent ⇒ contract 1, because every existing game
   * predates the field. See `KERNEL_CONTRACT_VERSION` for the additive-minor / breaking-major rule.
   */
  readonly kernelContract?: number;
  /** Human-readable name for the game picker. */
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /**
   * The player-colour palette this game offers, an ordered list of lowercase colour ids (e.g. Stone
   * Age's `['red','blue','green','yellow']`). The platform offers the pick and enforces uniqueness;
   * the game just declares which ids exist and in what order.
   *
   * **Order is load-bearing.** With no picks, seat `i` gets `palette[i]` (see `assignColors`), which
   * must reproduce each board's existing per-seat-index tints — so a game's palette is *its current
   * seat colours, in its current order*. Should cover `maxPlayers` so every seat can get a distinct
   * colour. These are **player** colours (a seat tint), not any game-piece colour a game may also have
   * (Container's container cargo is white/red/green/blue/yellow — unrelated to this).
   *
   * The resolved pick is handed to `createGame` as each seat's `color` (kernel 1.2.0), for the rare
   * game where the colour is rules data rather than a tint — see `createGame`.
   */
  readonly colors: readonly string[];

  /**
   * The difficulty tiers this game offers its AI seats (CS4), an ordered list of tier ids (e.g. Can't
   * Stop's `['easy','normal','hard']`). Absent ⇒ the game has one behaviour and no picker: a bot seat
   * stores the `'normal'` default and its driver ignores difficulty entirely (Container, Stone Age).
   *
   * The platform validates a requested tier against this list (`POST /games`, `POST /lobbies/:id/join`)
   * and publishes it on `GET /games/catalog` so the UI shows a picker **only** where tiers exist. The
   * contract stays game-import-free: these are opaque ids the module declares, exactly like `colors`.
   */
  readonly botDifficulties?: readonly string[];

  /**
   * The **table options** this game offers — rule variants a table picks before the deal (kernel
   * 1.5.0). Absent ⇒ the game has one fixed set of rules and the host renders no options control.
   *
   * Declared exactly like `colors` and `botDifficulties`: opaque, game-owned ids the host validates
   * against and renders generically, so the contract never learns what any option *means*. The host
   * resolves picks into a complete record (defaults filled) and hands it to `createGame` as
   * `options`; see `contracts/tableOptions.ts` for why the value union is closed and why there is no
   * free-number type.
   *
   * ⚠️ Unlike bots and colours, this is **rules data** — it reaches the engine, is folded into the
   * state at setup, and is therefore frozen at the deal. A game must not treat it as something a
   * player can change mid-game.
   */
  readonly tableOptions?: readonly TableOptionSpec[];

  /**
   * Build a fresh game. **`rng` is injected, never reached for.** Every engine here is pure and
   * deterministic; the module must not call `Math.random` itself, or replay and reproducible tests
   * both die. (Container shuffles its scoring deck with this.)
   *
   * Each seat carries the **colour it will be shown in** (kernel 1.2.0, D2c finding §16): the host
   * resolves every seat's colour *before* dealing — honouring the lobby/`POST /games` picks and
   * filling the rest from `colors` in palette order, exactly what `colorsFor` later reports — and
   * hands the resolved id in. It is always a member of this module's `colors`, and every seat has
   * one; `color?` is optional only so a game (or a test) can call `createGame` without it.
   *
   * **Most games ignore it.** A colour is normally presentation — a per-seat tint the board paints
   * meeples/hulls with — and stays coordination state outside the engine (design-patterns §2); all
   * five hosted games drop the field on the floor and deal exactly as they did before it existed. A
   * game reads it only when the colour **is a rule**: Labyrinth's pawn colour names the corner you
   * start on and must return to, so its engine takes the pick and the shell's seat tint and the
   * board's home corner can never disagree. That is the whole reason this channel exists — before it,
   * a picker for such a game was a picker that didn't pick.
   */
  createGame(opts: {
    readonly id: string;
    readonly players: readonly { readonly name: string; readonly color?: string }[];
    readonly rng: () => number;
    /**
     * The table's resolved rule variants (kernel 1.5.0) — **complete**: every id this module declared
     * in `tableOptions`, each at a validated pick or its declared default. Absent only for a game
     * that declares no options (and for a test that doesn't care), which is why it is optional here
     * and yet safe to read without a fallback in a game that does declare them.
     */
    readonly options?: TableOptions;
  }): S;

  /** Apply a move. Throws the game's own domain error, which `mapError` turns into a status. */
  applyAction(state: S, playerId: string, action: A): S;

  /** Enumerate what a seat may legally do. Drives UI affordances and the bots. */
  legalActions(state: S, playerId?: string): readonly A[];

  /**
   * Redact `state` for one viewer. **Every response and push carrying game state goes through this**
   * — it is the only thing standing between a client and another player's secrets.
   */
  viewFor(state: S, viewer: Viewer): unknown;

  /**
   * Validate opaque JSON into a typed action, or explain why it isn't one. The core route accepts
   * arbitrary JSON and delegates *all* action validation here, so adding a game never means teaching
   * the API a new set of action types.
   */
  parseAction(raw: unknown): ParseResult<A>;

  /** Secret-free digest for the "games in progress" list. Must never include hidden information. */
  summarize(state: S): GameSummary;

  /**
   * The state's version counter, mirrored onto the row. Must increase once per applied action: the
   * live clients version-guard their pushes with it, so a state whose version doesn't move can be
   * silently dropped as stale.
   */
  versionOf(state: S): number;

  /**
   * The game's append-only move log, for audit and replay. `[]` for a game that doesn't keep one.
   *
   * The repository persists whatever comes back, so **anything hidden that a game logs is on the
   * wire** — Container's rule is that a *losing* delivery bid is never recorded at all, rather than
   * recorded and hidden later.
   */
  movesOf(state: S): readonly MoveRecord[];

  /** Map a domain error to HTTP. `null` ⇒ not this module's error; let it bubble to a 500. */
  mapError(error: unknown): ErrorResponse | null;

  /**
   * The version of the *persisted state shape* this module currently reads (REVIEW §4.1). Absent ⇒ 1.
   *
   * Bump it whenever a shipped engine changes the shape of the state it serializes — every in-flight
   * game on the `/data` volume is frozen at the shape it was written at, and without this the server
   * would silently deserialize it into an engine that no longer matches. It is **not** the game
   * `version` (which counts moves) and it does **not** live in `GameState`: it describes what the
   * module expects on disk. The repository stamps every row with it and upgrades any older row on read.
   */
  readonly schemaVersion?: number;

  /**
   * Upgrade a state persisted at schema `from` to the module's current `schemaVersion`. Required once
   * `schemaVersion > 1` — a higher declared version with no `migrate` is a wiring error the repository
   * throws on. It owns its shape knowledge, per the seam rule, and may step through intermediate
   * versions internally (that is the module's business), but must return a state the current engine can
   * read. Pure and deterministic: the repository persists exactly what it returns, once, write-on-read.
   */
  migrate?(state: unknown, from: number): unknown;

  /**
   * Is this action currently owned by a flow of the module's own (so `POST /actions` must refuse it)?
   * Container returns a 409 for `DELIVER` while an auction is pending: its sealed bids live
   * server-side, and letting a client post its own `DELIVER` would hand the deliverer every
   * opponent's bid before they choose whether to buy out — the exact leak A1a closed.
   */
  pendingStep?(state: S, action: A): ErrorResponse | null;

  /** Register endpoints only this game has (Container: the `/auction/*` flow). */
  routes?(app: App, ctx: Ctx): void;

  /**
   * Called after the core has broadcast new state, so the module can push side-channels of its own
   * (Container: the projected auction). Runs on every state change, whoever caused it.
   */
  onStateChanged?(state: S, ctx: Ctx): void;

  /** Build the driver for this game's AI seats. Omit for a game with no bots. */
  createBotDriver?(ctx: Ctx): BotDriver;
}

/** Either a typed action or the reason the payload wasn't one. */
export type ParseResult<A> =
  { readonly ok: true; readonly action: A } | { readonly ok: false; readonly message: string };

/** A domain error mapped onto the wire. The core sends this verbatim. */
export interface ErrorResponse {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/** A public, secret-free summary of a game — enough to list and resume it, with no hidden state. */
export interface GameSummary {
  readonly id: string;
  readonly turn: number;
  readonly status: 'active' | 'ended';
  readonly activePlayerId: string | null;
  readonly players: readonly { readonly id: string; readonly name: string }[];
}

/**
 * A game's own view of persistence, with its module already bound in — so a module never has to name
 * itself to save its own state, and can't accidentally save it as some other game's.
 *
 * `unknown` because this is the shared contract; a module casts to the state type it knows it wrote.
 */
export interface ModuleGames {
  get(gameId: string): unknown;
  update(state: unknown): void;
}

/**
 * The slice of the host's real-time broadcast hub a game module actually touches (contract gap #2,
 * design doc §D1). A module that pushes a side-channel of its own — Container's `push.ts` is the only
 * one — calls exactly `broadcastEach`; nothing in a module reaches for `subscribe`/`send`/counts. This
 * structural interface exists so a **game package** can bind `ModuleContext`'s `Hub` generic without
 * importing the backend's concrete `GameHub` (which would be a workspace cycle). The backend proves its
 * `GameHub` satisfies this (compile-time assertion in `backend/src/games/module.ts`).
 */
export interface ModuleHub {
  /**
   * Broadcast to every client subscribed to `gameId`, each frame built for that subscriber's own
   * viewer so redaction stays an explicit per-viewer decision. Return value is ignored by callers.
   */
  broadcastEach(gameId: string, build: (viewer: Viewer) => unknown): void;
}

/**
 * The slice of the host's bot-seat store a game module actually reads (contract gap #2, design doc §D1).
 * Modules read which seats an AI holds (`listForGame`, used by every bot runner and the routes that
 * report bots) and — Can't Stop's runner alone — each seat's difficulty tier (`difficultiesForGame`,
 * CS4). This structural interface lets a game package bind `ModuleContext`'s `BotSeats` generic without
 * importing the backend's concrete `BotRepository`. The backend proves its `BotRepository` satisfies it.
 */
export interface ModuleBotSeats {
  /** The bot-held seat ids for a game (empty ⇒ an all-human game). */
  listForGame(gameId: string): readonly string[];
  /** Each bot seat's difficulty tier for a game (playerId → tier). Empty for an all-human game. */
  difficultiesForGame(gameId: string): Record<string, string>;
}

/** Plays a game's AI seats forward. The core only ever needs to say "something changed, catch up". */
export interface BotDriver {
  /**
   * Play every bot seat that is ready to act, stopping as soon as a human is on the clock. Must be a
   * no-op when there are no bots, when it's already a human's move, or on a finished game — the core
   * calls it on reads as well as writes.
   */
  tick(gameId: string): void;
}

/**
 * What a module is handed to do its job. Everything here is *coordination* infrastructure that isn't
 * specific to any one game; a module that needs its own state (Container's auctions) opens its own
 * table off `db`, the way lobbies and bots already do.
 *
 * The host bindings — `db`, `hub`, `botSeats` — are generic parameters so this contract stays free of
 * any backend import (the backend pins them to its concrete `DB`/`GameHub`/`BotRepository`).
 *
 * @typeParam Db - the host's database handle
 * @typeParam Hub - the host's real-time broadcast hub
 * @typeParam BotSeats - the host's store of which seats an AI holds
 */
export interface ModuleContext<Db = unknown, Hub = unknown, BotSeats = unknown> {
  readonly db: Db;
  readonly games: ModuleGames;
  /** Which seats an AI holds. Never part of game state — the engine must not learn what a bot is. */
  readonly botSeats: BotSeats;
  readonly hub: Hub;
  /**
   * A shared source of randomness for a module that needs it *per action* — the one the platform
   * injects at `createGame`, exposed here too. Container never touches it (its only randomness is the
   * setup shuffle), but Can't Stop rolls dice every turn: its roll route draws them from `rng` and
   * applies a pure engine action carrying the result, so the engine stays deterministic and the
   * client never chooses its own dice. **A module must not reach for `Math.random` itself** — that is
   * what keeps every engine replayable and its module testable with a seeded generator.
   */
  readonly rng: () => number;
  /**
   * Broadcast new state to every connected client, each projected for its own seat(s), then run
   * `onStateChanged`. The one way to tell the world a game moved.
   */
  readonly pushGame: (gameId: string, state: unknown) => void;
  /** This game's AI driver, for routes that must let the bots answer before replying. */
  readonly bots: BotDriver;
  /**
   * Each seat's chosen colour for a game (playerId → palette id), synthesising palette-order defaults
   * for any seat without a stored pick. Exposed so a module's *own* state-returning route (Can't Stop's
   * roll, Container's auction resolve) replies with the same `{ game, gameType, bots, colors }` shape
   * the core's `gamePayload` does — a colour is coordination state the module itself never stores.
   */
  readonly colorsFor: (gameId: string, state: unknown) => Record<string, string>;
}
