import type { DB } from './db';
import type { TableOptions } from '@game-hub/kernel';

/**
 * How long a never-started open lobby lives before the sweep reclaims it. A day is plenty for a home
 * server: a room nobody finished filling within 24h is abandoned, not pending. Started lobbies are
 * exempt — join-by-code still resolves them to their game.
 */
export const OPEN_LOBBY_TTL_MS = 24 * 60 * 60 * 1000;

/** How often the background sweep runs. Hourly — the TTL is a day, so coarse granularity is fine. */
export const LOBBY_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * A pre-game lobby (Track B). A shareable room with a fixed number of seats; players join by code
 * and claim a seat with their name. When every seat is filled the host starts the game, which is
 * when the engine's `createGame` runs (it needs all player names up front). Lobbies are coordination
 * state only — they live outside the engine and hold no rules logic.
 */
/** A claimed seat: who's in it, whether that's a person or the AI (Track A2), and its chosen colour. */
export interface LobbyMember {
  readonly name: string;
  readonly bot: boolean;
  /** The player colour this seat picked (a palette id), or undefined until one is chosen. */
  readonly color?: string;
  /** For a bot seat, the difficulty tier it plays by (CS4). Undefined ⇒ the game's default ('normal'). */
  readonly difficulty?: string;
}

export interface Lobby {
  readonly id: string;
  /** Which game this room is for — a registered `GameModule` id (roadmap C1). */
  readonly gameType: string;
  /** Number of seats (player count), within that game's own min/max. */
  readonly seats: number;
  /** Claimed seat, or `null` for an empty one. Length always equals `seats`. */
  readonly members: readonly (LobbyMember | null)[];
  readonly status: 'open' | 'started';
  /** The created game's id once the lobby has started, else `null`. */
  readonly gameId: string | null;
  /**
   * The rule variants this table will be dealt with (kernel 1.5.0), chosen by whoever opened the room
   * and fixed from that moment — the physical truth that you agree the house rules before the cards
   * come out, not once someone is losing. Absent on a lobby written before the feature (and on any
   * game that declares no options), which reads back as the game's own defaults at start.
   *
   * Needed **no migration**: lobbies are a JSON blob rather than columns, the same thing that made
   * `gameType` free to add at C1.
   */
  readonly options?: TableOptions;
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
  // `color` is the newest field; a lobby written before it simply has none, and reads back colour-less
  // (defaults are assigned at game start), exactly the way `gameType` defaults on a pre-C1 row.
  return {
    name: String(member.name ?? ''),
    bot: member.bot === true,
    ...(typeof member.color === 'string' ? { color: member.color } : {}),
    ...(typeof member.difficulty === 'string' ? { difficulty: member.difficulty } : {}),
  };
};

/**
 * Parse a stored row into a Lobby, normalizing any pre-A2 member shape and any pre-C1 row that
 * predates lobbies naming their game.
 *
 * Lobbies are a JSON blob rather than columns, so `gameType` needed no migration — but the same thing
 * that makes it free makes this default load-bearing: an open lobby written by the previous deploy
 * has no `gameType`, and Container was the only game there was.
 */
const readLobby = (json: string): Lobby => {
  const stored = JSON.parse(json) as Lobby;
  // `options` needs no normalizing (kernel 1.5.0): absent on an older row is exactly what "deal this
  // game's defaults" means, and `startGame` resolves an absent record to the module's declared defaults.
  return { ...stored, gameType: stored.gameType ?? 'container', members: stored.members.map(readMember) };
};

interface LobbyRow {
  data: string;
}

/** Persistence for lobbies. Mirrors GameRepository: a JSON snapshot keyed by id. */
export class LobbyRepository {
  constructor(private readonly db: DB) {}

  create(lobby: Lobby): void {
    const now = new Date().toISOString();
    // `status` is written as its own column *and* inside `data` — the column exists only so the poll
    // and the sweep can filter in SQL; `data` stays authoritative. Keep the two in lockstep.
    this.db
      .prepare(`INSERT INTO lobbies (id, data, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)`)
      .run(lobby.id, JSON.stringify(lobby), now, now, lobby.status);
  }

  get(id: string): Lobby | undefined {
    const row = this.db.prepare(`SELECT data FROM lobbies WHERE id = ?`).get(id) as LobbyRow | undefined;
    return row ? readLobby(row.data) : undefined;
  }

  /**
   * Open lobbies that still have a free seat, newest first — the "waiting for players" list.
   *
   * **Bounded on purpose:** the home screen polls this every 3s per visitor. The coarse cut (only
   * `open` lobbies, newest first, capped at `limit`) is pushed into SQL against
   * `idx_lobbies_status_created`, so the poll never parses every lobby row ever created — only the
   * free-seat refinement, which SQL can't cheaply express over the JSON `members` array, runs in JS
   * over at most `limit` rows. Mirrors `GameRepository.listActive` (SQL filter + LIMIT, fine filter in
   * JS). A full-but-open lobby is transient (it flips to `started` the instant someone starts it) and
   * the expiry sweep caps how long an unfilled open lobby lingers, so the coarse cut can't be swamped.
   */
  listOpen(limit = 50): Lobby[] {
    const rows = this.db
      .prepare(`SELECT data FROM lobbies WHERE status = 'open' ORDER BY created_at DESC LIMIT ?`)
      .all(limit) as LobbyRow[];
    return rows.map((row) => readLobby(row.data)).filter((lobby) => lobby.members.some((member) => member === null));
  }

  /**
   * Delete never-started open lobbies created before `before` (an ISO timestamp), returning how many
   * were removed. Started lobbies are kept — join-by-code resolves them to their game, so they must
   * outlive the open window. Nothing else ever deletes a lobby, so without this sweep the table grows
   * without bound on the persistent `/data` volume (REVIEW §4.3).
   */
  deleteExpiredOpen(before: string): number {
    return this.db.prepare(`DELETE FROM lobbies WHERE status = 'open' AND created_at < ?`).run(before).changes;
  }

  update(lobby: Lobby): void {
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE lobbies SET data = ?, updated_at = ?, status = ? WHERE id = ?`)
      .run(JSON.stringify(lobby), now, lobby.status, lobby.id);
  }
}
