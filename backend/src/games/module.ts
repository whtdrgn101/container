import type { FastifyInstance } from 'fastify';
import type { BotRepository } from '../bots';
import type { DB } from '../db';
import type { GameHub } from '../hub';

/**
 * The `GameModule` seam (roadmap C0).
 *
 * One typed contract every game on the site implements, so the backend can host more than Container.
 * The engine already had the right shape — a pure `state + action → state` library with a
 * serializable state and a `viewFor` redaction hook — so this mostly *names* seams that existed.
 *
 * **This file must never import a game.** It is the contract; `games/container/` is one implementation
 * and `registry.ts` is the lookup. Anything Container-specific that leaks in here defeats the point.
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
 * just lives inside the Container module instead of in the shared core. If C3's second game turns out
 * to need the same thing, *that* is when the common shape is real enough to extract.
 */
export interface GameModule<S, A> {
  /** Stable id, used as the `game_type` discriminator and in URLs. */
  readonly id: string;
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
   */
  readonly colors: readonly string[];

  /**
   * Build a fresh game. **`rng` is injected, never reached for.** Every engine here is pure and
   * deterministic; the module must not call `Math.random` itself, or replay and reproducible tests
   * both die. (Container shuffles its scoring deck with this.)
   */
  createGame(opts: {
    readonly id: string;
    readonly players: readonly { readonly name: string }[];
    readonly rng: () => number;
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
  routes?(app: FastifyInstance, ctx: ModuleContext): void;

  /**
   * Called after the core has broadcast new state, so the module can push side-channels of its own
   * (Container: the projected auction). Runs on every state change, whoever caused it.
   */
  onStateChanged?(state: S, ctx: ModuleContext): void;

  /** Build the driver for this game's AI seats. Omit for a game with no bots. */
  createBotDriver?(ctx: ModuleContext): BotDriver;
}

/** Who a projection is for: one seat, several (hotseat), or `null`/`[]`. Mirrors the engine's `Viewer`. */
export type Viewer = string | readonly string[] | null;

/** Either a typed action or the reason the payload wasn't one. */
export type ParseResult<A> =
  { readonly ok: true; readonly action: A } | { readonly ok: false; readonly message: string };

/** A domain error mapped onto the wire. The core sends this verbatim. */
export interface ErrorResponse {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/**
 * One entry in a game's append-only move log. Structurally the engine's own `MoveRecord` — restated
 * here so the contract doesn't import a game, which is the whole point of this file.
 */
export interface MoveRecord {
  readonly seq: number;
  readonly type: string;
  readonly playerId: string;
  readonly payload?: Record<string, unknown>;
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
 */
export interface ModuleContext {
  readonly db: DB;
  readonly games: ModuleGames;
  /** Which seats an AI holds. Never part of game state — the engine must not learn what a bot is. */
  readonly botSeats: BotRepository;
  readonly hub: GameHub;
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
