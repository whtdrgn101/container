/**
 * The **transport DTOs** — the wire shapes a game's client and the hosting shell both name (Track D /
 * D2b, closing design-doc "contract gap #1").
 *
 * These lived in `ui/src/lib/api.ts` until D2b, which meant a game package's `./client` had to reach the
 * hub's UI through its `@` alias to name the payload it receives. That is fine in-workspace and
 * impossible out of it, so the **contract** moved here while the **implementation** (the fetch calls, the
 * socket, the lobby/catalog endpoints) stayed behind: `@game-hub/ui-kit` owns the game-facing REST
 * helpers, and the shell keeps everything only it uses.
 *
 * What's here is deliberately only what a *game client* names: the payload it is handed and the
 * side-channel frame it may interpret. Shell-only DTOs (`Lobby`, `GameInfo`, `GameSummary`, `StatePush`,
 * `RematchInfo`) are not contract — they never cross the game seam — and stay in the shell.
 *
 * Reached through the `@game-hub/kernel/client` subpath (re-exported by `./client.ts`), because these
 * shapes only matter to a UI. They are interfaces only, so the emitted module is empty and the kernel
 * still ships with no runtime dependencies.
 */

/**
 * Secret-free seat identity carried beside every game state (roadmap C2 / REVIEW §3.3).
 *
 * Lets a client name seats and apply seat-binding rules **without** reading the opaque game blob — the
 * one thing the shell must never duck-type.
 */
export interface GameIdentity {
  /** Seats in order, name-and-id only — no hidden info. Filled from the module's `summarize`. */
  players: { id: string; name: string }[];
  /** Whose turn it is, or `null` (e.g. a finished game). */
  activePlayerId: string | null;
}

/**
 * A game, plus what a generic caller needs to make sense of it — what every state-returning route and
 * every `type: 'state'` socket push carries.
 *
 * `gameType` says which board reads `game`; `bots` and `colors` travel *beside* the state rather than
 * inside it, because which seats are bots and which colour each picked is coordination state the engine
 * never learns about (design-patterns §2).
 *
 * @typeParam S - the game's per-client (redacted) view type; `unknown` at the seam, pinned by the game's
 * own `api.ts` so a board is never handed an `unknown`.
 */
export interface GamePayload<S = unknown> extends GameIdentity {
  game: S;
  gameType: string;
  bots: string[];
  /** Each seat's chosen player colour (playerId → palette id). Beside the game like `bots`. */
  colors: Record<string, string>;
}

/**
 * Anything the server pushes down a game's socket that isn't a `type: 'state'` frame — a game's own
 * side-channel (Container's `type: 'auction'`).
 *
 * The shell forwards these verbatim as `BoardProps.lastMessage` without interpreting them; narrowing one
 * to a concrete shape is the game's job (`isAuctionPush`). Open-ended by design: the transport must never
 * learn what an auction is.
 */
export interface GameMessage {
  type: string;
  [key: string]: unknown;
}
