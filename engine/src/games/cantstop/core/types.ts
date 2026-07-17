import type { MoveRecord } from '../../../kernel';

// The append-only move-log entry is a kernel primitive shared by every game; re-exported here so
// Can't Stop's own modules import it from `../core` alongside the rest of the domain types.
export type { MoveRecord } from '../../../kernel';

/** Which half of a turn we're in: free to roll (or stop), or owing a pairing choice for the dice. */
export type Phase = 'rolling' | 'selecting';

/** A single seat. All Can't Stop state is public — there is nothing to redact. */
export interface CantStopPlayer {
  readonly id: string;
  readonly name: string;
  /**
   * Permanent progress (colored squares) as a height per column. A column absent from the map (or 0)
   * means no square yet; a height equal to `COLUMN_HEIGHTS[col]` means it was banked at the top and
   * that player claimed the column.
   */
  readonly progress: Readonly<Record<number, number>>;
}

/** The complete, serializable state of a Can't Stop game. Plain data — safe to JSON round-trip. */
export interface CantStopState {
  readonly id: string;
  readonly players: readonly CantStopPlayer[];
  /** Index into `players` of whose turn it is. */
  readonly activePlayerIndex: number;
  /** Turn counter, incremented each time the active seat changes. */
  readonly turn: number;
  /** Which player id (if any) has won each column. A claimed column can never be entered again. */
  readonly claimed: Readonly<Record<number, string>>;
  /**
   * The active turn's temporary markers ("runners") as a height per column — at most `MAX_RUNNERS`
   * columns. Empty between turns; banked into `progress` on STOP, discarded on a bust.
   */
  readonly runners: Readonly<Record<number, number>>;
  /** `rolling`: may roll again (or stop, if runners are out). `selecting`: must pick a pairing for `dice`. */
  readonly phase: Phase;
  /** The four dice awaiting a SELECT, or `null` in the `rolling` phase. */
  readonly dice: readonly [number, number, number, number] | null;
  readonly status: 'active' | 'ended';
  /** Winner(s) — a single id once someone claims `WIN_COLUMNS` columns; empty until then. */
  readonly winnerIds: readonly string[];
  /** Monotonic version, incremented once per applied action. Used for optimistic concurrency. */
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
