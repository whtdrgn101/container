/**
 * The **platform WS envelopes** — the shell-owned frames the server pushes down a game's socket besides
 * `state` and besides a game's own side-channels (kernel 1.3.0).
 *
 * The socket's `type` field is deliberately open (`GameMessage` is `{ type: string; [k]: unknown }`), so
 * these already *flowed* through `subscribeGame`'s `onMessage` without any kernel change. What lived only
 * in the hub's `ui/src` — and, independently, in the backend — was their *typing*: the DTOs and the two
 * narrowing guards. They belong on the shared contract because both hosts speak them and an out-of-repo
 * game's shell (or a future kernel consumer) may want to recognise a `chat`/`presence` frame too. So the
 * types moved here while `GameMessage` **stays open** — a new platform (or game) frame type must keep
 * flowing without a kernel bump.
 *
 * These are `chat` and `presence`, the two game-agnostic, table-public coordination channels (design
 * doc §4): chat is fanned out from the REST send route, presence from the hub on every roster change.
 * Reached through the `@game-hub/kernel/client` subpath (re-exported by `./client.ts`), alongside the
 * transport DTOs — the shell narrows them, and the frames only ever matter to a UI.
 *
 * Unlike `./transport.ts` and the contract files, this module carries **runtime code** (the two guards),
 * so it is the one `contracts/` file the coverage gate measures. It imports no React and pulls in nothing
 * at runtime (its one import is type-only), so `@game-hub/kernel/client` still ships zero runtime deps.
 */
import type { GameMessage } from './transport.js';

/**
 * One in-game chat message — coordination state, game-agnostic and table-public. Append-only and keyed by
 * a per-game `seq`, so a resuming client can be handed the recent tail in order and dedupe on it.
 */
export interface ChatMessage {
  /** Per-game monotonically increasing sequence — the stable id a client dedupes and orders by. */
  readonly seq: number;
  /** The seat that spoke (a player id). Always a real seat: spectators are read-only. */
  readonly senderId: string;
  /** The seat's display name captured at send time, so a later rename can't rewrite history. */
  readonly sender: string;
  readonly body: string;
  /** ISO timestamp the message was stored. */
  readonly at: string;
}

/** One entry in a game room's presence roster: a stable per-connection id and its viewer label. */
export interface PresenceViewer {
  /** Stable for the life of the socket, so a client can key/dedupe the roster. */
  readonly id: string;
  /** Human-readable viewer label (seat name(s), `'Spectator'`, or `'Table'`). */
  readonly label: string;
}

/**
 * A `chat` frame: a batch of messages — one new (the live fan-out sends a one-element list) or a resume
 * backfill (the recent tail). The `type` literal is what `isChatPush` narrows on.
 */
export interface ChatPush {
  readonly type: 'chat';
  // A freshly JSON-parsed array off the socket — mutable, so the shell can accumulate/merge it without a
  // defensive copy (the DTO elements stay readonly).
  readonly messages: ChatMessage[];
}

/** A `presence` frame: the game room's current viewer roster, pushed on every subscription change. */
export interface PresencePush {
  readonly type: 'presence';
  readonly viewers: PresenceViewer[];
}

/** Narrow an open `GameMessage` to a `chat` frame (a batch of messages — one new, or a resume backfill). */
export function isChatPush(message: GameMessage): message is GameMessage & ChatPush {
  return message.type === 'chat' && Array.isArray((message as { messages?: unknown }).messages);
}

/** Narrow an open `GameMessage` to a `presence` frame (the current viewer roster). */
export function isPresencePush(message: GameMessage): message is GameMessage & PresencePush {
  return message.type === 'presence' && Array.isArray((message as { viewers?: unknown }).viewers);
}
