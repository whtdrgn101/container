import type { GameEndState, MoveRecord } from '@game-hub/kernel';
import type { EndBonusCard, RouteId, TrackColor } from './constants';
import type { Engineer } from './engineers';

// The append-only move-log entry is a kernel primitive; re-exported so the modules import it alongside
// the domain types.
export type { MoveRecord } from '@game-hub/kernel';

/**
 * One of a player's three private routes (pg. 6, 8). `spaces` is the ordered list of track-marker slots
 * (index 0 is space 1); a `null` slot is empty. RR1 seeds index 0 with a `wood` track and never advances
 * it — the color ladder, thresholds and doublers land RR3+.
 */
export interface Route {
  readonly id: RouteId;
  /** Ordered track spaces; each holds a track colour or is empty (`null`). */
  readonly spaces: readonly (TrackColor | null)[];
}

/**
 * A locomotive a player owns (pg. 6, 10). RR1 has only the starting `#1`; the route it sits on and the
 * factory-flip mechanic are RR4/RR5, so the shape is intentionally minimal here.
 */
export interface Locomotive {
  /** Printed number (2–10; the starting one is 1 — pg. 6, 10). */
  readonly number: number;
}

/**
 * A player's industry track (pg. 11–13). RR1 tracks only the wrench position (0 = start); the gap-filling
 * factories and scoring land RR5.
 */
export interface Industry {
  /** The wrench's position on the industry track (pg. 13). 0 at setup. */
  readonly wrench: number;
}

/**
 * One player (pg. 6). `endBonus` (the single held end-bonus card) is the game's **one per-player secret**
 * — redacted by `viewFor` to a held-count for opponents (nobody holds one in RR1, but the shape redacts
 * from day one — the SP/SA convention).
 */
export interface RussianRailroadsPlayer {
  readonly id: string;
  readonly name: string;
  /** Workers still in the personal supply, available to place (pg. 7). */
  readonly workersAvailable: number;
  /** Total workers this player owns (pg. 6). RR1: equals the starting count; RR6 grows it. */
  readonly workersTotal: number;
  /** Coins held in the personal supply — kept across rounds (pg. 14). */
  readonly coins: number;
  /** The three routes, in board order (pg. 6, 8). */
  readonly routes: readonly Route[];
  /** Locomotives owned (pg. 6, 10). RR1: just the starting `#1`. */
  readonly locomotives: readonly Locomotive[];
  /** The industry track (pg. 11–13). RR1: wrench at start. */
  readonly industry: Industry;
  /** Engineers this player has hired (pg. 15–16). RR1: none — hiring lands RR7. */
  readonly hiredEngineers: readonly Engineer[];
  /**
   * The per-turn **action pool** (pg. 7): actions that became available this turn (engineer actions,
   * factory triggers), resolvable in any order, partially, and **never saved for the next turn**. A
   * first-class field from RR1 because three later slices hang off it; empty until RR7 fills it.
   */
  readonly actionPool: readonly string[];
  /**
   * This player's held end-bonus card (pg. 22), or `null`. **The game's one secret** — `viewFor` redacts
   * an opponent's to a count. Always `null` in RR1 (drawing end-bonus cards is RR8).
   */
  readonly endBonus: EndBonusCard | null;
  /** The turn-order card dealt to this player (pg. 5): 1–4, lower goes earlier in round 1. */
  readonly turnOrderCard: number;
  /** Whether this player has passed this round (pg. 7). A pass is terminal for the round. */
  readonly passed: boolean;
}

/** One placement on a shared action space (pg. 7, 14): whose it is, and how many workers/coins it used. */
export interface SpacePlacement {
  readonly ownerId: string;
  /** Workers placed here — returned to the owner's supply at round end (pg. 21). */
  readonly workers: number;
  /** Coins placed here (worker-substitutes, pg. 14) — returned to the **general** supply at round end. */
  readonly coins: number;
}

/**
 * The general supplies near the board (pg. 6–7). Coins are explicitly **unlimited** (pg. 14: "Coins are
 * not limited"), so they aren't tracked here. RR1 has nothing finite to track yet; `doublers` is present
 * for the shape (RR3 sets the real starting count when doublers land — RR1 never reads it).
 */
export interface RussianRailroadsSupplies {
  /** Doubler tiles remaining (pg. 7, 14). Consumed from RR3; RR1 leaves it at 0 and never reads it. */
  readonly doublers: number;
}

/**
 * The complete, serializable state of a Russian Railroads game — the RR1 worker-placement spine.
 *
 * Designed for the whole game (fields later slices need are present and honestly typed); only what RR1
 * uses is populated. Intersected with the kernel `GameEndState` union (REVIEW §3.1): while `active` there
 * is no `results`/`winnerIds`; once `ended` (the stub end at the round count, real scoring RR2/RR8) both
 * are present. Narrow on `status` before reading them.
 */
export type RussianRailroadsState = {
  readonly id: string;
  readonly players: readonly RussianRailroadsPlayer[];
  /**
   * Occupancy of every shared action space, keyed by space id (pg. 7): each id maps to the list of
   * placements on it. A normal space is **occupied** (blocked for the round) when its list is non-empty;
   * the never-occupied bottom track space (pg. 9) accumulates placements but is never blocked. A space
   * with no placements is absent from the map.
   */
  readonly actionSpaces: Readonly<Record<string, readonly SpacePlacement[]>>;
  /**
   * The engineer strip (pg. 5, 15–16): 7 slots at 4 players, 6 at 2 players, 7 with the left-most empty
   * at 3 players. Each slot holds an engineer or is empty (`null`). It slides one space right each round
   * (pg. 21–22).
   */
  readonly engineerStrip: readonly (Engineer | null)[];
  /**
   * The face-down end-bonus pile (pg. 5), a real secret — `viewFor` carries its **count** only. Shuffled
   * with 2 removed unseen at setup; nobody draws from it until RR8.
   */
  readonly endBonusPile: readonly EndBonusCard[];
  /**
   * Turn order for the current round (pg. 5): seat indices into `players`, in play order. RR1 fixes this
   * from the dealt turn-order cards for the whole game; the full turn-order track (pass scores the card's
   * reverse; the claim spaces reorder it) is RR6.
   */
  readonly turnOrder: readonly number[];
  /** Whose turn it is — a seat index into `players` (always a member of `turnOrder`). */
  readonly activePlayerIndex: number;
  /** The current round (1-based). */
  readonly round: number;
  /** Total rounds this game (pg. 7, 22–23): 7 at 4 players, 6 at 2–3. */
  readonly rounds: number;
  readonly supplies: RussianRailroadsSupplies;
  readonly version: number;
  readonly log: readonly MoveRecord[];
} & GameEndState<RussianRailroadsResult>;

/**
 * One player's end-of-game result. RR1 ships a **stub**: the game ends at the round count with every
 * player scored 0 (a shared victory), because real per-round scoring (RR2) and final scoring (RR8) don't
 * exist yet. The shape carries `total` so RR2/RR8 fill it in without a state migration.
 */
export interface RussianRailroadsResult {
  readonly playerId: string;
  /** Final score. RR1 stub: 0 for everyone. */
  readonly total: number;
}
