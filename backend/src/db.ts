import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

export type DB = BetterSqliteDatabase;

/**
 * Schema. We store the whole engine state as a JSON snapshot (the engine state is
 * plain, serializable data) plus an append-only `moves` log for audit/replay.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id           TEXT PRIMARY KEY,
  state        TEXT NOT NULL,
  version      INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  -- When the game was abandoned, else NULL. A **soft delete**: the row and its move log stay for
  -- audit and replay, the game just stops being playable and drops off the in-progress list. Nothing
  -- game-specific about it, so it lives in the core rather than in any GameModule.
  abandoned_at TEXT
);

CREATE TABLE IF NOT EXISTS moves (
  game_id    TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  type       TEXT NOT NULL,
  player_id  TEXT NOT NULL,
  payload    TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seq),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Pre-game lobbies: a shareable room with N seats that players claim by name before the game starts.
-- Stored as a JSON snapshot (like games); short-lived coordination state, not part of the engine.
CREATE TABLE IF NOT EXISTS lobbies (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Pending delivery auctions: sealed bids collected from each player before the engine's single
-- atomic DELIVER action can be built. Coordination state (like lobbies), not engine state — at most
-- one open auction per game, deleted the moment it resolves. Persisted so an auction survives a
-- restart mid-bidding rather than wedging the game at Container Island.
-- NOTE: the data column holds SECRET bids. Never serve this row to a client unprojected; every
-- response must go through auctionViewFor, which hides bids until all opponents have committed.
CREATE TABLE IF NOT EXISTS delivery_auctions (
  game_id    TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Which seats an AI drives (Track A2). Coordination state, like lobbies and auctions: the engine
-- knows nothing about bots, and a bot's move is just an ordinary action it validates.
-- A separate table rather than a games column on purpose: CREATE TABLE IF NOT EXISTS needs no
-- migration, so an already-deployed database picks this up by simply starting the new build.
CREATE TABLE IF NOT EXISTS game_bots (
  game_id   TEXT NOT NULL,
  player_id TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);
`;

/**
 * Columns added to a table after it first shipped.
 *
 * ⚠️ **`CREATE TABLE IF NOT EXISTS` does not alter an existing table.** Every earlier schema change
 * here was a whole new table, so the schema string alone was enough. A new *column* is different: on
 * an already-deployed database — which is the entire point of mounting `/data` on a volume — the
 * `CREATE TABLE` above is a no-op and the column would simply never appear, so the first query naming
 * it throws. These run on every open and are no-ops once applied (and on a fresh database, where the
 * schema above already includes them).
 */
const ADDED_COLUMNS: readonly { readonly table: string; readonly column: string; readonly ddl: string }[] = [
  { table: 'games', column: 'abandoned_at', ddl: `ALTER TABLE games ADD COLUMN abandoned_at TEXT` },
];

/** Bring an existing database up to the current schema. Additive only — never drops or rewrites. */
function addMissingColumns(db: DB): void {
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((existing) => existing.name === column)) db.exec(ddl);
  }
}

/** Open (or create) a SQLite database and ensure the schema exists. Defaults to in-memory. */
export function createDatabase(path = ':memory:'): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  addMissingColumns(db);
  return db;
}
