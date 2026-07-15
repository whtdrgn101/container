import { viewFor } from '@container/engine';
import type { GameState, Viewer } from '@container/engine';

/**
 * Real-time fan-out for game state (Track B / B2). The REST layer stays authoritative; whenever a
 * game mutates, the hub pushes the new state to every connected subscriber — each projected through
 * `viewFor` for that subscriber's own seat, so hidden info (secret scoring cards) never crosses to
 * the wrong client. This is the seam online play turns on: one game = one room, one socket = one seat.
 */

/** The minimal slice of a WebSocket the hub depends on (keeps it decoupled + trivially testable). */
export interface Sendable {
  readonly readyState: number;
  send(data: string): void;
}

/** The wire message pushed to clients. `type` leaves room for future kinds (chat, presence, …). */
export interface StateMessage {
  readonly type: 'state';
  readonly game: ReturnType<typeof viewFor>;
}

interface Subscriber {
  readonly socket: Sendable;
  /** Seat(s) to project for, or `null` to follow the active player (hotseat default). */
  readonly viewerId: Viewer;
}

const WS_OPEN = 1; // WebSocket.OPEN readyState

const activeId = (state: GameState): string | null => state.players[state.activePlayerIndex]?.id ?? null;

function project(state: GameState, viewerId: Viewer): StateMessage {
  // A null viewer follows whoever is active (a shared hotseat screen shows the current player); a
  // seat list projects for exactly those seats; an empty list is a spectator (sees no cards).
  return { type: 'state', game: viewFor(state, viewerId ?? activeId(state)) };
}

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

  /** Send a single socket the current state (the initial sync sent right after it connects). */
  sendState(socket: Sendable, state: GameState, viewerId: Viewer): void {
    if (socket.readyState !== WS_OPEN) return;
    socket.send(JSON.stringify(project(state, viewerId)));
  }

  /** Push new state to every subscriber of a game, each projected for its own seat. */
  broadcast(gameId: string, state: GameState): void {
    const room = this.rooms.get(gameId);
    if (!room) return;
    for (const sub of room) {
      if (sub.socket.readyState !== WS_OPEN) continue;
      sub.socket.send(JSON.stringify(project(state, sub.viewerId)));
    }
  }
}
