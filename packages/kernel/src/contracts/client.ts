import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * The transport DTOs a game client names (Track D / D2b). They live in their own module but are part of
 * the same `@game-hub/kernel/client` surface: a game's `types.ts` imports the contract *and* the DTOs it
 * binds into it from one specifier. Type-only, so it adds nothing to `client.js`.
 */
export type { GameIdentity, GameMessage, GamePayload } from './transport.js';

/**
 * The platform WS envelopes carried on a game's socket besides `state` and a game's own side-channels
 * (kernel 1.3.0): the `chat`/`presence` DTOs, their frame shapes, and the two narrowing guards. `GameMessage`
 * stays deliberately open (§`transport.ts`) — these are the *typed* recognisers for the frames the shell
 * owns, not a closed union, so a new frame type still flows without a kernel bump. The two guards are the
 * one bit of **runtime** code on this subpath; they import no React, so `client.js` stays React-free.
 */
export type { ChatMessage, ChatPush, PresencePush, PresenceViewer } from './platform.js';
export { isChatPush, isPresencePush } from './platform.js';

/**
 * The `GameClient` seam (roadmap C2) — the UI's mirror of the backend's `GameModule` — now a **shared
 * kernel contract** (Track D / D0), so an out-of-repo game package's UI can build against it.
 *
 * The shell is a games room: it owns the landing screen, the lobby, navigation, and the transport
 * (one REST client, one WebSocket per game). It knows nothing about any game's rules or shape. A game
 * plugs in a **board** and the shell renders it.
 *
 * **This contract must never import a game** — it is the interface; each game package's `./client` is one
 * implementation and the generated registry is the lookup (same rule as the module contract).
 *
 * `Payload`/`Message` stay **generic parameters** even though D2b brought the transport DTOs into this
 * package (`./transport.ts`, re-exported above). Two reasons: binding them here would drop two type
 * parameters, which is a *breaking* arity change (major bump — see `contract.ts`) for a purely cosmetic
 * win; and a host is still free to hand its boards a richer payload than the platform's. Each game
 * package's `client/types.ts` pins them to `GamePayload<S>`/`GameMessage`, which is what keeps every
 * board's `BoardProps<S>` and `GameClient<S>` reading as one type argument.
 *
 * This is the one kernel entry that depends on React, so it lives behind the `@game-hub/kernel/client`
 * subpath rather than the framework-free `.` barrel — a backend/engine consumer never pulls React in.
 *
 * @typeParam S - the game's per-client (redacted) view type
 * @typeParam Payload - the shell's game-payload DTO (the UI binds `GamePayload<S>`)
 * @typeParam Message - the shell's socket side-channel frame (the UI binds `GameMessage`)
 */
export interface GameClient<S = unknown, Payload = unknown, Message = unknown> {
  /** Matches the backend module's id and the row's `game_type`. */
  readonly id: string;
  /** Human-readable name, for the picker and the page heading. */
  readonly name: string;
  /**
   * A one-line description shown on the landing when this game is selected — what it is, in a sentence.
   * Presentation content, so it lives here on the UI plugin (not the server catalog). Cheap and
   * **non-lazy**: the landing shows it without loading the board chunk.
   */
  readonly blurb: string;
  /** A few short "how to play" bullets, shown in a collapsible on the landing. Optional. */
  readonly rules?: readonly string[];
  /**
   * The game's own identity mark — its "box lid". Rendered by the shell in the game picker; a game without
   * one gets a neutral lid. A component taking `{ className?: string }` so the shell sizes/tints it.
   *
   * **Lazy on purpose**, exactly like `Board`: the picker shows every hosted game, so an eager icon would
   * ship every game's mark (and whatever art it pulls in) to someone who only opened the home screen.
   * Type-erased to `ComponentType<{ className?: string }>` the same way `Board` erases its props at the
   * seam — `React.lazy(() => import('./Icon'))` satisfies it. Optional and unrendered as yet: it lands in
   * the shell with the Card Table redesign.
   */
  readonly Icon?: LazyExoticComponent<ComponentType<{ className?: string }>>;
  /**
   * The board. **Lazy on purpose**: a games room shouldn't ship every game's board to someone who
   * opened the home screen, and Container's board pulls in the whole engine.
   */
  readonly Board: LazyExoticComponent<ComponentType<BoardProps<S, Payload, Message>>>;
  /**
   * The game's status line for the shell header ("Turn 3 · Ann · 2 actions left").
   *
   * A slot rather than something the header derives, because only a game knows what its own status
   * says — actions-remaining is a Container rule, not a platform concept. Keep it cheap and
   * **non-lazy**: it renders the instant you enter a game, before the board chunk lands.
   */
  readonly Status?: ComponentType<{ game: S }>;
}

/**
 * What the shell hands a board.
 *
 * Generic in `S` so a board is **fully typed against its own engine** — Container's board is a
 * `ComponentType<BoardProps<GameView>>` and never sees an `unknown`. The registry erases `S` to store
 * mixed games together (the same method-bivariance bargain the backend's `AnyGameModule` makes), but
 * the erasure stops at the seam. **Don't widen a board's props to `unknown` to make it fit.**
 */
export interface BoardProps<S, Payload = unknown, Message = unknown> {
  readonly gameId: string;
  /** The current state, projected for this client's seats. */
  readonly game: S;
  /** Seats an AI holds. Coordination state — beside the game, never inside it. */
  readonly bots: readonly string[];
  /**
   * Each seat's chosen player colour (playerId → palette id). Coordination state beside the game like
   * `bots`; a board maps the id to its own tint system, falling back to seat index when one is missing.
   */
  readonly colors: Readonly<Record<string, string>>;
  /**
   * The seats this client may drive, or `null` for hotseat (drives them all). The shell owns seat
   * binding because it's a platform concern; the board consumes it to gate its own affordances.
   */
  readonly controlledIds: string[] | null;
  /** `?viewer=` for this client's seats — pass to any call that returns a projected state. */
  readonly viewer: string | undefined;
  /** True while the shell has a request in flight; disable affordances rather than double-submit. */
  readonly busy: boolean;
  /** Run work with the shell's busy/error handling. Errors surface in the shell's banner. */
  readonly guard: (work: () => Promise<void>) => Promise<void>;
  /** Push a new payload up to the shell after an action (version-guarded there). */
  readonly onPayload: (payload: Payload) => void;
  /** Leave this game and go back to the hub. The game keeps running server-side. */
  readonly onLeave: () => void;
  /**
   * Side-channel pushes from the game's socket — everything that isn't `type: 'state'`. The shell
   * owns the socket and forwards these verbatim without interpreting them (Container reads
   * `type: 'auction'`). `null` until one arrives.
   */
  readonly lastMessage: Message | null;
}
