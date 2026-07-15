import type { DB } from './db';

/**
 * A pre-game lobby (Track B). A shareable room with a fixed number of seats; players join by code
 * and claim a seat with their name. When every seat is filled the host starts the game, which is
 * when the engine's `createGame` runs (it needs all player names up front). Lobbies are coordination
 * state only — they live outside the engine and hold no rules logic.
 */
export interface Lobby {
  readonly id: string;
  /** Number of seats (player count), 3–5. */
  readonly seats: number;
  /** Claimed name per seat, or `null` for an empty seat. Length always equals `seats`. */
  readonly members: readonly (string | null)[];
  readonly status: 'open' | 'started';
  /** The created game's id once the lobby has started, else `null`. */
  readonly gameId: string | null;
}

interface LobbyRow {
  data: string;
}

/** Persistence for lobbies. Mirrors GameRepository: a JSON snapshot keyed by id. */
export class LobbyRepository {
  constructor(private readonly db: DB) {}

  create(lobby: Lobby): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`INSERT INTO lobbies (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run(lobby.id, JSON.stringify(lobby), now, now);
  }

  get(id: string): Lobby | undefined {
    const row = this.db.prepare(`SELECT data FROM lobbies WHERE id = ?`).get(id) as LobbyRow | undefined;
    return row ? (JSON.parse(row.data) as Lobby) : undefined;
  }

  /** Open lobbies that still have a free seat, newest first — the "waiting for players" list. */
  listOpen(): Lobby[] {
    const rows = this.db.prepare(`SELECT data FROM lobbies ORDER BY created_at DESC`).all() as LobbyRow[];
    return rows
      .map((row) => JSON.parse(row.data) as Lobby)
      .filter((lobby) => lobby.status === 'open' && lobby.members.some((member) => member === null));
  }

  update(lobby: Lobby): void {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE lobbies SET data = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(lobby), now, lobby.id);
  }
}
