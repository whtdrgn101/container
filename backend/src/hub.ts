import type { Viewer } from './games';

/**
 * Real-time fan-out for game state (Track B / B2). The REST layer stays authoritative; whenever a
 * game mutates, the hub pushes the new state to every connected subscriber — each projected for that
 * subscriber's own seat, so hidden info (secret scoring cards) never crosses to the wrong client.
 * This is the seam online play turns on: one game = one room, one socket = one seat.
 *
 * **Game-agnostic (roadmap C1).** The hub knows nothing about game state, and deliberately doesn't
 * project anything itself — it hands each subscriber's seat back to the caller and sends whatever
 * comes out. That keeps redaction an explicit decision made by code that knows the game (through its
 * `GameModule`), rather than something the transport does by accident with one game's rules baked in.
 */

/** The minimal slice of a WebSocket the hub depends on (keeps it decoupled + trivially testable). */
export interface Sendable {
  readonly readyState: number;
  send(data: string): void;
}

/** The wire message pushed to clients. `type` leaves room for future kinds (chat, presence, …). */
export interface StateMessage {
  readonly type: 'state';
  /** A `GameView` — whatever the game's own `viewFor` produced for this subscriber. */
  readonly game: unknown;
  /** Which game this is, so a client hosting several knows how to read `game` (roadmap C2). */
  readonly gameType: string;
  /**
   * Seats an AI holds. Rides alongside the game rather than inside it: bot-ness is coordination
   * state, not a rule, so it never enters a game's state (see `bots.ts`).
   */
  readonly bots: readonly string[];
  /** Each seat's chosen colour (playerId → palette id). Beside the game like `bots`, never inside it. */
  readonly colors: Readonly<Record<string, string>>;
  /**
   * Secret-free seat identity, sourced from the module's `summarize` (roadmap C2 / REVIEW §3.3). The
   * shell reads these to name seats (tab title, rematch) and to apply platform seat-binding rules
   * without duck-typing the opaque `game` blob — a game that called its seats `seats` would otherwise
   * break the shell with no type error.
   */
  readonly players: readonly { readonly id: string; readonly name: string }[];
  readonly activePlayerId: string | null;
}

interface Subscriber {
  readonly socket: Sendable;
  /** Seat(s) to project for, or `null` to follow the active player (hotseat default). */
  readonly viewerId: Viewer;
}

const WS_OPEN = 1; // WebSocket.OPEN readyState

export class GameHub {
  private readonly rooms = new Map<string, Set<Subscriber>>();

  /** Register a socket for a game's updates. Returns an unsubscribe function (call it on close). */
  subscribe(gameId: string, socket: Sendable, viewerId: Viewer): () => void {
    const sub: Subscriber = { socket, viewerId };
    const room = this.rooms.get(gameId) ?? new Set<Subscriber>();
    room.add(sub);
    this.rooms.set(gameId, room);
    return () => {
      room.delete(sub);
      if (room.size === 0) this.rooms.delete(gameId);
    };
  }

  /** Live subscriber count for a game (diagnostics / tests). */
  subscriberCount(gameId: string): number {
    return this.rooms.get(gameId)?.size ?? 0;
  }

  /** Send one socket a message (the initial sync sent right after it connects). */
  send(socket: Sendable, message: unknown): void {
    if (socket.readyState !== WS_OPEN) return;
    socket.send(JSON.stringify(message));
  }

  /**
   * Push a per-viewer message to every subscriber of a game. `build` is called once per socket with
   * that socket's seat(s), so the caller decides what each client is allowed to see.
   *
   * The hub deliberately knows nothing about *what* is being sent — that keeps redaction the
   * caller's explicit job rather than something the transport does by accident.
   */
  broadcastEach(gameId: string, build: (viewerId: Viewer) => unknown): void {
    const room = this.rooms.get(gameId);
    if (!room) return;
    for (const sub of room) {
      if (sub.socket.readyState !== WS_OPEN) continue;
      sub.socket.send(JSON.stringify(build(sub.viewerId)));
    }
  }
}
