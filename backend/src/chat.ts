import type { DB } from './db';

/**
 * In-game chat — coordination state, **game-agnostic** and **table-public**.
 *
 * Like lobbies, bots and rematches, chat lives entirely outside the engine: a module never learns a
 * message exists, and no rule depends on one. It is table-public on purpose — every viewer of a game
 * sees every message, with no per-seat redaction — which keeps it consistent with the platform's
 * "everything logged is public" stance (design-patterns §3). Messages are append-only and keyed by a
 * per-game sequence, so a resuming client can be handed the recent tail in order.
 */
export interface ChatMessage {
  /** Per-game monotonically increasing sequence — the stable id a client dedupes and orders by. */
  readonly seq: number;
  /** The seat that spoke (a player id). Always a real seat: spectators are read-only. */
  readonly senderId: string;
  /** The seat's display name captured at send time, so a later rename can't rewrite history. */
  readonly sender: string;
  readonly body: string;
  /** ISO timestamp the message was stored. */
  readonly at: string;
}

interface ChatRow {
  seq: number;
  sender_id: string;
  sender: string;
  body: string;
  created_at: string;
}

const toMessage = (row: ChatRow): ChatMessage => ({
  seq: row.seq,
  senderId: row.sender_id,
  sender: row.sender,
  body: row.body,
  at: row.created_at,
});

/** Persistence for a game's chat log. Append-only; one row per message. */
export class ChatRepository {
  constructor(private readonly db: DB) {}

  /**
   * Append a message to a game's log and return the stored record (with its assigned `seq`).
   *
   * `seq` is the next per-game sequence — `MAX(seq) + 1`, computed and inserted in one synchronous
   * span (better-sqlite3 is synchronous, and there is no `await` between the read and the write) so two
   * concurrent appends can't collide on the same number, exactly like the move log.
   */
  append(gameId: string, message: { senderId: string; sender: string; body: string }, now: string): ChatMessage {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(seq), 0) AS max FROM chat_messages WHERE game_id = ?`)
      .get(gameId) as {
      max: number;
    };
    const seq = row.max + 1;
    this.db
      .prepare(
        `INSERT INTO chat_messages (game_id, seq, sender_id, sender, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(gameId, seq, message.senderId, message.sender, message.body, now);
    return { seq, senderId: message.senderId, sender: message.sender, body: message.body, at: now };
  }

  /**
   * The most recent `limit` messages for a game, in send order (oldest first) — the resume backfill.
   * Reads the newest `limit` by `seq DESC` then re-orders ascending, so the tail is bounded but the
   * client still receives them in reading order.
   */
  recent(gameId: string, limit: number): ChatMessage[] {
    const rows = this.db
      .prepare(
        `SELECT seq, sender_id, sender, body, created_at FROM chat_messages
         WHERE game_id = ? ORDER BY seq DESC LIMIT ?`,
      )
      .all(gameId, limit) as ChatRow[];
    return rows.reverse().map(toMessage);
  }
}
