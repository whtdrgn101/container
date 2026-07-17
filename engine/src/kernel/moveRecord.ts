/**
 * One entry in a game's append-only move log, for replay/audit and the backend's move feed.
 *
 * Game-agnostic on purpose: every game records moves the same shape, and the backend's `GameModule`
 * contract restates this structurally so it need not import any engine. Anything a game logs is on the
 * wire — a game with a genuine secret must not record it (Container never records a losing bid).
 */
export interface MoveRecord {
  readonly seq: number;
  readonly type: string;
  readonly playerId: string;
  readonly payload?: Record<string, unknown>;
}
