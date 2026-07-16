import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';

export type DB = BetterSqliteDatabase;

/**
 * Schema. We store the whole engine state as a JSON snapshot (the engine state is
 * plain, serializable data) plus an append-only `moves` log for audit/replay.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id         TEXT PRIMARY KEY,
  state      TEXT NOT NULL,
  version    INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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
`;

/** Open (or create) a SQLite database and ensure the schema exists. Defaults to in-memory. */
export function createDatabase(path = ':memory:'): DB {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
