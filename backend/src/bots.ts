import type { DB } from './db';

/**
 * Which seats in a game are driven by the AI (Track A2).
 *
 * Coordination state, exactly like lobbies and pending auctions: **the engine never learns what a
 * bot is.** A bot's move arrives at `applyAction` as an ordinary action and is validated like any
 * human's, which is what stops "it's a bot" from ever becoming a rules concept — and what lets the
 * same `GameState` be replayed, scored, and reasoned about without knowing who was at the keyboard.
 */
export class BotRepository {
  constructor(private readonly db: DB) {}

  /** Record the bot seats for a game. Replaces any existing set. */
  setForGame(gameId: string, playerIds: readonly string[]): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO game_bots (game_id, player_id) VALUES (?, ?)');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_bots WHERE game_id = ?').run(gameId);
      for (const playerId of playerIds) {
        insert.run(gameId, playerId);
      }
    })();
  }

  /** The bot seats in a game, in seat order. Empty for an all-human game. */
  listForGame(gameId: string): string[] {
    const rows = this.db
      .prepare('SELECT player_id FROM game_bots WHERE game_id = ? ORDER BY player_id')
      .all(gameId) as { player_id: string }[];
    return rows.map((row) => row.player_id);
  }
}
