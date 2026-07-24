import type { DB } from './db';

/**
 * A bot seat: which player id an AI drives, and (CS4) which difficulty tier it plays by. `difficulty`
 * is a module-declared tier id (`GameModule.botDifficulties`); a game that declares none stores the
 * `'normal'` default and its driver never reads it.
 */
export interface BotSeat {
  readonly id: string;
  /** The difficulty tier this seat plays by. Defaults to `'normal'` when omitted. */
  readonly difficulty?: string;
}

/**
 * Which seats in a game are driven by the AI (Track A2), and at what difficulty (CS4).
 *
 * Coordination state, exactly like lobbies and pending auctions: **the engine never learns what a
 * bot is** — nor what a difficulty is. A bot's move arrives at `applyAction` as an ordinary action and
 * is validated like any human's, which is what stops "it's a bot" from ever becoming a rules concept —
 * and what lets the same `GameState` be replayed, scored, and reasoned about without knowing who was at
 * the keyboard.
 *
 * The **wire `bots` payload stays `string[]`** (the ids only) — the UI and every existing test depend
 * on it — so `listForGame` is unchanged. Difficulty is exposed additively through `difficultiesForGame`
 * for the one caller that needs it (Can't Stop's bot driver).
 */
export class BotRepository {
  constructor(private readonly db: DB) {}

  /** Record the bot seats for a game, each with its difficulty tier. Replaces any existing set. */
  setForGame(gameId: string, seats: readonly BotSeat[]): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO game_bots (game_id, player_id, difficulty) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_bots WHERE game_id = ?').run(gameId);
      for (const seat of seats) {
        insert.run(gameId, seat.id, seat.difficulty ?? 'normal');
      }
    })();
  }

  /** The bot seats in a game, in seat order. Empty for an all-human game. Ids only (the wire shape). */
  listForGame(gameId: string): string[] {
    const rows = this.db
      .prepare('SELECT player_id FROM game_bots WHERE game_id = ? ORDER BY player_id')
      .all(gameId) as { player_id: string }[];
    return rows.map((row) => row.player_id);
  }

  /** Each bot seat's difficulty tier for a game (playerId → tier). Empty for an all-human game. */
  difficultiesForGame(gameId: string): Record<string, string> {
    const rows = this.db.prepare('SELECT player_id, difficulty FROM game_bots WHERE game_id = ?').all(gameId) as {
      player_id: string;
      difficulty: string;
    }[];
    return Object.fromEntries(rows.map((row) => [row.player_id, row.difficulty]));
  }
}
