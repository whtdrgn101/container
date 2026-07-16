import type { DB } from './db';

/**
 * A pre-game lobby (Track B). A shareable room with a fixed number of seats; players join by code
 * and claim a seat with their name. When every seat is filled the host starts the game, which is
 * when the engine's `createGame` runs (it needs all player names up front). Lobbies are coordination
 * state only — they live outside the engine and hold no rules logic.
 */
/** A claimed seat: who's in it, and whether that's a person or the AI (Track A2). */
export interface LobbyMember {
  readonly name: string;
  readonly bot: boolean;
}

export interface Lobby {
  readonly id: string;
  /** Number of seats (player count), 3–5. */
  readonly seats: number;
  /** Claimed seat, or `null` for an empty one. Length always equals `seats`. */
  readonly members: readonly (LobbyMember | null)[];
  readonly status: 'open' | 'started';
  /** The created game's id once the lobby has started, else `null`. */
  readonly gameId: string | null;
}

/**
 * Read a member back, tolerating rows written before seats could be bots (when a member was just a
 * name string). Lobbies are persisted JSON, and a started lobby outlives the deploy that made it —
 * so an old row must still open rather than crash on `member.name`.
 */
const readMember = (raw: unknown): LobbyMember | null => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return { name: raw, bot: false };
  const member = raw as Partial<LobbyMember>;
  return { name: String(member.name ?? ''), bot: member.bot === true };
};

/** Parse a stored row into a Lobby, normalizing any pre-A2 member shape. */
const readLobby = (json: string): Lobby => {
  const stored = JSON.parse(json) as Lobby;
  return { ...stored, members: stored.members.map(readMember) };
};

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
    return row ? readLobby(row.data) : undefined;
  }

  /** Open lobbies that still have a free seat, newest first — the "waiting for players" list. */
  listOpen(): Lobby[] {
    const rows = this.db.prepare(`SELECT data FROM lobbies ORDER BY created_at DESC`).all() as LobbyRow[];
    return rows
      .map((row) => readLobby(row.data))
      .filter((lobby) => lobby.status === 'open' && lobby.members.some((member) => member === null));
  }

  update(lobby: Lobby): void {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE lobbies SET data = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(lobby), now, lobby.id);
  }
}
