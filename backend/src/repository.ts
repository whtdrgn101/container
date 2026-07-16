import type { DB } from './db';
import type { AnyGameModule, GameSummary, MoveRecord } from './games';

interface GameRow {
  id: string;
  state: string;
  game_type: string;
}

/**
 * A listable game: the module's secret-free summary plus the seats an AI holds (which is coordination
 * state, so it lives here rather than in any game's state).
 */
export type GameListing = GameSummary & {
  /** Seats an AI holds — so the resume list never offers you a seat the server already plays. */
  bots: string[];
  /** Which game this is, so a generic client knows which board to open (roadmap C2). */
  gameType: string;
};

interface MoveRow {
  seq: number;
  type: string;
  player_id: string;
  payload: string | null;
}

/**
 * Persistence for games. Every engine stays pure; all I/O lives here.
 *
 * **Game-agnostic (roadmap C0).** A game's state is an opaque JSON blob to this class — it never
 * reads a field off one. The three things a row needs (the id, the version, the move log) come from
 * the game's own `GameModule`, so hosting a second game means implementing that contract, not
 * teaching the repository a new shape.
 */
export class GameRepository {
  constructor(private readonly db: DB) {}

  /** Insert a brand-new game (and any moves already in its log), stamped with the module that owns it. */
  create(module: AnyGameModule, state: unknown): void {
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, state, version, created_at, updated_at, game_type) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: unknown) => {
      insertGame.run(module.summarize(s).id, JSON.stringify(s), module.versionOf(s), now, now, module.id);
      this.persistMoves(module, s, now);
    });
    tx(state);
  }

  /**
   * Which `GameModule` owns this row, or undefined if there is no such game.
   *
   * The answer to the question C0 couldn't ask. `state` is an opaque blob, so this column is the only
   * thing that says whose rules it plays by — and handing one game's state to another game's engine
   * is precisely what it exists to prevent.
   */
  typeOf(id: string): string | undefined {
    const row = this.db.prepare(`SELECT game_type FROM games WHERE id = ?`).get(id) as
      | { game_type: string }
      | undefined;
    return row?.game_type;
  }

  /**
   * Load a game's current state, or undefined if it does not exist. Opaque — only its module can read it.
   *
   * Abandoned games still load: the row is soft-deleted, not gone, so an old link or a client that
   * was mid-game still resolves rather than 404ing. Whether an abandoned game may be *played* is a
   * separate question, and `isAbandoned` answers it.
   */
  get(id: string): unknown {
    const row = this.db.prepare(`SELECT state FROM games WHERE id = ?`).get(id) as GameRow | undefined;
    return row ? JSON.parse(row.state) : undefined;
  }

  /**
   * Abandon a game — the **soft delete**. Keeps the row and its move log (audit, replay, and a
   * mis-click is undoable with one UPDATE) while taking the game out of play.
   *
   * Idempotent, and deliberately does not re-stamp an already-abandoned game: the timestamp records
   * when it was *first* abandoned. Returns false if there was no such game.
   */
  abandon(id: string, at = new Date().toISOString()): boolean {
    const result = this.db
      .prepare(`UPDATE games SET abandoned_at = ? WHERE id = ? AND abandoned_at IS NULL`)
      .run(at, id);
    return result.changes > 0 || this.isAbandoned(id);
  }

  /** True if this game has been abandoned (and so must not be played on). False for an unknown game. */
  isAbandoned(id: string): boolean {
    const row = this.db.prepare(`SELECT abandoned_at FROM games WHERE id = ?`).get(id) as
      | { abandoned_at: string | null }
      | undefined;
    return row?.abandoned_at != null;
  }

  /**
   * Secret-free summaries of in-progress games (most-recently-updated first), for the resume list.
   *
   * Takes a resolver keyed by **game type**, not game id: the type comes back with each row, so this
   * stays one query rather than a lookup per game. The module renders the summary, because only it
   * knows the shape of its own state. **Whatever it returns goes on the wire to anyone**, so a
   * module's `summarize` must never include hidden information.
   *
   * A row whose `game_type` is no longer registered is skipped rather than thrown on — pulling a game
   * out of the registry shouldn't take the whole home screen down with it.
   */
  listActive(moduleOfType: (gameType: string) => AnyGameModule | undefined, limit = 50): GameListing[] {
    // Abandoned games are filtered in SQL, before the limit — otherwise a run of abandoned games
    // would eat the page and hide live ones from the resume list.
    const rows = this.db
      .prepare(
        `SELECT id, state, game_type FROM games WHERE abandoned_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as GameRow[];
    const botRows = this.db.prepare(`SELECT game_id, player_id FROM game_bots`).all() as {
      game_id: string;
      player_id: string;
    }[];
    const botsByGame = new Map<string, string[]>();
    for (const row of botRows) {
      botsByGame.set(row.game_id, [...(botsByGame.get(row.game_id) ?? []), row.player_id]);
    }

    return rows
      .map((row) => {
        const module = moduleOfType(row.game_type);
        return module ? { ...module.summarize(JSON.parse(row.state)), gameType: row.game_type } : null;
      })
      .filter((summary) => summary !== null)
      .filter((summary) => summary.status === 'active')
      .map((summary) => ({ ...summary, bots: botsByGame.get(summary.id) ?? [] }));
  }

  /** Overwrite a game's snapshot and append any newly-logged moves. */
  update(module: AnyGameModule, state: unknown): void {
    const updateGame = this.db.prepare(
      `UPDATE games SET state = ?, version = ?, updated_at = ? WHERE id = ?`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: unknown) => {
      updateGame.run(JSON.stringify(s), module.versionOf(s), now, module.summarize(s).id);
      this.persistMoves(module, s, now);
    });
    tx(state);
  }

  /** Read the ordered move log for a game (handy for debugging / future replay). */
  listMoves(id: string): MoveRecord[] {
    const rows = this.db
      .prepare(`SELECT seq, type, player_id, payload FROM moves WHERE game_id = ? ORDER BY seq`)
      .all(id) as MoveRow[];
    return rows.map((row) => ({
      seq: row.seq,
      type: row.type,
      playerId: row.player_id,
      ...(row.payload ? { payload: JSON.parse(row.payload) as Record<string, unknown> } : {}),
    }));
  }

  /** Idempotently write every move in the state's log (INSERT OR IGNORE keyed by game_id+seq). */
  private persistMoves(module: AnyGameModule, state: unknown, now: string): void {
    const insertMove = this.db.prepare(
      `INSERT OR IGNORE INTO moves (game_id, seq, type, player_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const gameId = module.summarize(state).id;
    for (const move of module.movesOf(state)) {
      insertMove.run(
        gameId,
        move.seq,
        move.type,
        move.playerId,
        move.payload ? JSON.stringify(move.payload) : null,
        now,
      );
    }
  }
}
