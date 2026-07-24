import type { DB } from './db';
import type { AnyGameModule, GameSummary, MoveRecord } from './games';

interface GameRow {
  id: string;
  state: string;
  game_type: string;
  schema_version: number;
}

/**
 * A stored state was saved at a schema version *newer* than the module that now wants to read it — the
 * server is older than the row (REVIEW §4.1). We cannot safely migrate backwards, so the read is
 * refused. Same family as an unregistered `game_type`: the game exists, we just can't play it here.
 * The core maps this to `409 GAME_SCHEMA_UNSUPPORTED`; `listActive` skips such rows.
 */
export class SchemaUnsupportedError extends Error {
  constructor(
    readonly gameId: string,
    readonly rowVersion: number,
    readonly moduleVersion: number,
  ) {
    super(
      `Game "${gameId}" was saved at schema v${rowVersion}, newer than this server's v${moduleVersion}`,
    );
    this.name = 'SchemaUnsupportedError';
  }
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

  /** The schema version a module reads its state at — absent ⇒ 1 (the shape everything shipped with). */
  private schemaVersionOf(module: AnyGameModule): number {
    return module.schemaVersion ?? 1;
  }

  /** Insert a brand-new game (and any moves already in its log), stamped with the module that owns it. */
  create(module: AnyGameModule, state: unknown): void {
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, state, version, created_at, updated_at, game_type, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: unknown) => {
      insertGame.run(
        module.summarize(s).id,
        JSON.stringify(s),
        module.versionOf(s),
        now,
        now,
        module.id,
        this.schemaVersionOf(module),
      );
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
   * **Migrates on read where module and row meet (REVIEW §4.1).** A row stamped at an older
   * `schema_version` than the module now declares is handed to `module.migrate` and re-stamped
   * *before* it is returned, so callers only ever see the current shape. A row stamped *newer* than
   * the module throws `SchemaUnsupportedError` (the server is behind the data). The repository stays
   * shape-agnostic throughout: it reads no field off the state, only calls the module's hooks.
   *
   * Takes the module (like `create`/`update`) because only the module knows its current shape and how
   * to reach it. Abandoned games still load: the row is soft-deleted, not gone, so an old link or a
   * client that was mid-game still resolves rather than 404ing. Whether an abandoned game may be
   * *played* is a separate question, and `isAbandoned` answers it.
   */
  get(module: AnyGameModule, id: string): unknown {
    const row = this.db.prepare(`SELECT state, schema_version FROM games WHERE id = ?`).get(id) as
      | { state: string; schema_version: number }
      | undefined;
    return row ? this.upgraded(module, id, row.state, row.schema_version) : undefined;
  }

  /** True if a game row exists at all — the game-agnostic existence check (no module, no migration). */
  exists(id: string): boolean {
    return this.db.prepare(`SELECT 1 FROM games WHERE id = ?`).get(id) !== undefined;
  }

  /**
   * Bring a persisted state up to the module's current schema, persisting the upgrade once (REVIEW §4.1).
   *
   * - equal ⇒ parse and return, untouched (the common path — no migration exists for a v1 game).
   * - older ⇒ `module.migrate(state, from)`, then persist the result + new `schema_version` and return
   *   it. The write is **not a move**: no `version` bump, no move-log append, no `updated_at` touch (a
   *   migration must not reorder the resume list). Write-on-read, so a row pays the cost once.
   * - newer ⇒ `SchemaUnsupportedError` (the server is older than the row).
   *
   * A higher declared `schemaVersion` with no `migrate` is a wiring bug, thrown loudly rather than
   * guessed at — a shipped state shape changed and nobody wrote the upgrade.
   */
  private upgraded(module: AnyGameModule, id: string, rawState: string, rowVersion: number): unknown {
    const state: unknown = JSON.parse(rawState);
    const target = this.schemaVersionOf(module);
    if (rowVersion === target) return state;
    if (rowVersion > target) throw new SchemaUnsupportedError(id, rowVersion, target);
    if (!module.migrate) {
      throw new Error(
        `Game "${id}" is stored at schema v${rowVersion} but its module declares v${target} with no migrate()`,
      );
    }
    const migrated = module.migrate(state, rowVersion);
    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE games SET state = ?, schema_version = ? WHERE id = ?`)
        .run(JSON.stringify(migrated), target, id);
    })();
    return migrated;
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
        `SELECT id, state, game_type, schema_version FROM games WHERE abandoned_at IS NULL ORDER BY updated_at DESC LIMIT ?`,
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
        if (!module) return null;
        // Migrate a stale-schema row lazily, exactly like `get` — `summarize` reads the current shape,
        // so an un-upgraded old row could crash it. Stamp it too, so the 3s poll pays the cost once. A
        // row from a newer server (SchemaUnsupportedError) is skipped, like an unregistered type, rather
        // than crashing the whole home screen.
        let state: unknown;
        try {
          state = this.upgraded(module, row.id, row.state, row.schema_version);
        } catch (error) {
          if (error instanceof SchemaUnsupportedError) return null;
          throw error;
        }
        return { ...module.summarize(state), gameType: row.game_type };
      })
      .filter((summary) => summary !== null)
      .filter((summary) => summary.status === 'active')
      .map((summary) => ({ ...summary, bots: botsByGame.get(summary.id) ?? [] }));
  }

  /** Overwrite a game's snapshot and append any newly-logged moves. */
  update(module: AnyGameModule, state: unknown): void {
    const updateGame = this.db.prepare(
      `UPDATE games SET state = ?, version = ?, updated_at = ?, schema_version = ? WHERE id = ?`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: unknown) => {
      // A live write is always at the module's current shape, so it re-stamps `schema_version` too —
      // keeping the column truthful even if a migration and a move land in the same session.
      updateGame.run(JSON.stringify(s), module.versionOf(s), now, this.schemaVersionOf(module), module.summarize(s).id);
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
