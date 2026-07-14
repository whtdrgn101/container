import type { GameState, MoveRecord } from '@container/engine';
import type { DB } from './db';

interface GameRow {
  state: string;
}

interface MoveRow {
  seq: number;
  type: string;
  player_id: string;
  payload: string | null;
}

/** Persistence for games. The engine stays pure; all I/O lives here. */
export class GameRepository {
  constructor(private readonly db: DB) {}

  /** Insert a brand-new game (and any moves already in its log). */
  create(state: GameState): void {
    const insertGame = this.db.prepare(
      `INSERT INTO games (id, state, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: GameState) => {
      insertGame.run(s.id, JSON.stringify(s), s.version, now, now);
      this.persistMoves(s, now);
    });
    tx(state);
  }

  /** Load a game's current state, or undefined if it does not exist. */
  get(id: string): GameState | undefined {
    const row = this.db.prepare(`SELECT state FROM games WHERE id = ?`).get(id) as GameRow | undefined;
    return row ? (JSON.parse(row.state) as GameState) : undefined;
  }

  /** Overwrite a game's snapshot and append any newly-logged moves. */
  update(state: GameState): void {
    const updateGame = this.db.prepare(
      `UPDATE games SET state = ?, version = ?, updated_at = ? WHERE id = ?`,
    );
    const now = new Date().toISOString();
    const tx = this.db.transaction((s: GameState) => {
      updateGame.run(JSON.stringify(s), s.version, now, s.id);
      this.persistMoves(s, now);
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
  private persistMoves(state: GameState, now: string): void {
    const insertMove = this.db.prepare(
      `INSERT OR IGNORE INTO moves (game_id, seq, type, player_id, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const move of state.log) {
      insertMove.run(
        state.id,
        move.seq,
        move.type,
        move.playerId,
        move.payload ? JSON.stringify(move.payload) : null,
        now,
      );
    }
  }
}
