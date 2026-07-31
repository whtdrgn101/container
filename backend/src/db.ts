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
  abandoned_at TEXT,
  -- Which GameModule owns this row (roadmap C1). The state column is an opaque blob, so without this
  -- the server cannot tell one game's rules from another's — this column is the whole reason a second
  -- game can exist. Defaults to 'container' so every row written before it existed backfills to the
  -- only game there was.
  game_type    TEXT NOT NULL DEFAULT 'container',
  -- The schema version of the persisted state *shape* (REVIEW §4.1). The state blob is frozen on disk
  -- the moment it's written; a shipped engine that later changes its shape leaves every in-flight game
  -- deserializing into an engine that no longer matches. This column records the shape each row was
  -- saved at, so GameRepository.get can hand an older row to the owning module's migrate() and stamp
  -- it forward. It is NOT the game version column (that counts moves), and it never lives in GameState.
  -- Defaults to 1 so every row written before it existed backfills to the only shape there was.
  schema_version INTEGER NOT NULL DEFAULT 1
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
-- status is a real column, not only a JSON field, so the every-3s "waiting for players" poll and the
-- expiry sweep can filter in SQL (indexed) instead of parsing every row ever created. It mirrors the
-- authoritative status inside the data blob; LobbyRepository writes both in lockstep.
CREATE TABLE IF NOT EXISTS lobbies (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'open'
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
  -- Which difficulty tier this AI seat plays by (CS4). A module declares its tiers
  -- (GameModule.botDifficulties); a game with none stores the default and its driver ignores the
  -- column. Defaults to 'normal' so every bot seat written before this column backfills to the tier
  -- that was the only behaviour there was — the same game_type lesson (assert column AND value).
  difficulty TEXT NOT NULL DEFAULT 'normal',
  PRIMARY KEY (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Which colour each seat picked. Coordination state, exactly like game_bots: a colour is
-- presentation (a player-color tint), never a rule, so the engine never learns it. The available
-- palette is the module's (GameModule.colors); this table just records who ended up with which id.
-- A separate table so CREATE TABLE IF NOT EXISTS picks it up on an existing database with no
-- migration, and old games with no rows synthesize defaults from palette order at read time.
CREATE TABLE IF NOT EXISTS game_colors (
  game_id   TEXT NOT NULL,
  player_id TEXT NOT NULL,
  color     TEXT NOT NULL,
  PRIMARY KEY (game_id, player_id),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- In-game chat (presence + chat feature). Coordination state, game-agnostic and **table-public**: the
-- engine never learns a message exists, and every viewer of the game sees every message (no per-seat
-- redaction — consistent with "everything logged is public"). Append-only, keyed by game and a per-game
-- sequence, so a resuming client can be backfilled the recent tail in order. A separate table, so
-- CREATE TABLE IF NOT EXISTS picks it up on an existing database with no migration.
CREATE TABLE IF NOT EXISTS chat_messages (
  game_id    TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  -- The seat that spoke (a player id). A send must name a real seat; spectators are read-only, so this
  -- is never null — but the label is stored alongside so a rename can't retro-change a printed message.
  sender_id  TEXT NOT NULL,
  sender     TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (game_id, seq),
  FOREIGN KEY (game_id) REFERENCES games(id)
);

-- A proposed rematch of a finished game. Coordination state, game-agnostic (like lobbies/bots): when
-- enough of the same players agree, a fresh game of the same type starts with the same seats + bot
-- assignments. Keyed by the finished game; holds who has agreed and the new game's id once it starts.
-- A separate table, so CREATE TABLE IF NOT EXISTS picks it up on an existing database with no migration.
CREATE TABLE IF NOT EXISTS rematches (
  game_id     TEXT PRIMARY KEY,
  agreed      TEXT NOT NULL,
  new_game_id TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (game_id) REFERENCES games(id)
);
`;

/**
 * Indexes for the home-screen polls (`GET /games` + `GET /lobbies`, hit every 3s per visitor) and the
 * lobby sweep. `CREATE INDEX IF NOT EXISTS` — unlike `ADD COLUMN` — *does* apply to an existing table,
 * so these live in their own block run **after** `addMissingColumns` (below): a couple reference
 * migrated columns (`abandoned_at`, `lobbies.status`) that a legacy database only grows during the
 * migration, so building the index before that would throw "no such column".
 *
 * - games: `listActive` is `WHERE abandoned_at IS NULL ORDER BY updated_at DESC LIMIT` — a partial
 *   index over exactly the un-abandoned rows, keyed on `updated_at`, matches it end to end.
 * - lobbies: `listOpen` and the sweep are both `status = 'open' [AND created_at < ?] ORDER BY
 *   created_at` — a `(status, created_at)` composite serves the filter and the ordering together.
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS idx_games_active_updated ON games(updated_at) WHERE abandoned_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_lobbies_status_created ON lobbies(status, created_at);
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
  // The backfill *is* the DEFAULT: SQLite stamps every existing row with 'container' as it adds the
  // column, which is exactly right — before this column, Container was the only game there was.
  {
    table: 'games',
    column: 'game_type',
    ddl: `ALTER TABLE games ADD COLUMN game_type TEXT NOT NULL DEFAULT 'container'`,
  },
  // Persisted-state schema version (REVIEW §4.1). The backfill *is* the DEFAULT: SQLite stamps every
  // existing row with 1 as it adds the column, which is exactly right — before this column, every
  // stored state was written at shape v1 by definition. Must live here as well as in the schema
  // string, or an already-deployed database (the whole point of the `/data` volume) never grows it.
  {
    table: 'games',
    column: 'schema_version',
    ddl: `ALTER TABLE games ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1`,
  },
  // Per-seat bot difficulty (CS4). The backfill *is* the DEFAULT: SQLite stamps every existing bot
  // seat 'normal' as the column is added — before this column, every bot played the one (normal)
  // policy. Must live here as well as in the schema string, or an already-deployed database (the
  // whole point of the `/data` volume) never grows it.
  {
    table: 'game_bots',
    column: 'difficulty',
    ddl: `ALTER TABLE game_bots ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'normal'`,
  },
  // Promote `status` out of the JSON blob into a real, indexable column (REVIEW §4.3). The DEFAULT
  // stamps every existing row 'open' as the column is added; the second statement then backfills the
  // *true* status from each row's JSON so a already-started lobby isn't mislabeled open. `db.exec`
  // runs both statements. (json_extract is core SQLite/JSON1, compiled into better-sqlite3.)
  {
    table: 'lobbies',
    column: 'status',
    ddl:
      `ALTER TABLE lobbies ADD COLUMN status TEXT NOT NULL DEFAULT 'open';` +
      `UPDATE lobbies SET status = json_extract(data, '$.status') ` +
      `WHERE json_extract(data, '$.status') IN ('open', 'started')`,
  },
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
  db.exec(INDEXES); // after migrations: some indexes reference columns added there
  return db;
}
