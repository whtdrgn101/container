import type { DB } from './db';

/**
 * A proposed rematch of a finished game.
 *
 * Coordination state, **game-agnostic** — like lobbies, bots and auctions, it lives outside the engine
 * (a rematch is "start another game with the same players", which is true of any game). One player
 * proposes, another agrees, and a fresh game of the same type starts with the same seats and the same
 * bot assignments.
 *
 * `agreed` is the set of *human* seat ids that have opted in; `newGameId` is `null` until the game
 * actually starts, then the id every watching client navigates to.
 */
export interface Rematch {
  readonly gameId: string;
  readonly agreed: readonly string[];
  readonly newGameId: string | null;
}

interface RematchRow {
  agreed: string;
  new_game_id: string | null;
}

/** Persistence for rematch proposals. One row per finished game. */
export class RematchRepository {
  constructor(private readonly db: DB) {}

  get(gameId: string): Rematch | undefined {
    const row = this.db
      .prepare(`SELECT agreed, new_game_id FROM rematches WHERE game_id = ?`)
      .get(gameId) as RematchRow | undefined;
    if (!row) return undefined;
    return { gameId, agreed: JSON.parse(row.agreed) as string[], newGameId: row.new_game_id };
  }

  /** Insert or update the rematch for a game (upsert on the game_id primary key). */
  save(rematch: Rematch, now: string): void {
    this.db
      .prepare(
        `INSERT INTO rematches (game_id, agreed, new_game_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(game_id) DO UPDATE SET agreed = excluded.agreed, new_game_id = excluded.new_game_id, updated_at = excluded.updated_at`,
      )
      .run(rematch.gameId, JSON.stringify(rematch.agreed), rematch.newGameId, now, now);
  }
}
