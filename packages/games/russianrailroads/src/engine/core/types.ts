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
 * A locomotive a player owns (pg. 6, 10). RR1 had only the starting `#1`; RR2 adds the `route` it sits on
 * because **loco reach gates route scoring** (pg. 20: "only spaces reached by locomotives are scored", and
 * a route's reach is the sum of its locos' numbers — #6 + #2 reach space 8). The lowest-available
 * acquisition + upgrade chains + factory flip are RR4/RR5, so the shape stays otherwise minimal.
 */
export interface Locomotive {
  /** Printed number (2–10; the starting one is 1 — pg. 6, 10). Contributes this much to its route's reach. */
  readonly number: number;
  /** Which route this locomotive sits on (pg. 6, 10). The starting #1 is on the Trans-Siberian (pg. 6). */
  readonly route: RouteId;
}

/**
 * A player's industry track (pg. 11–13). The wrench walks the shared `INDUSTRY_LANE`; the player's own
 * state is the wrench's lane index plus which of the 5 gaps they have filled with factories.
 */
export interface Industry {
  /** The wrench's position — a lane index into `INDUSTRY_LANE` (pg. 13). 0 (START) at setup. */
  readonly wrench: number;
  /**
   * The 5 gap slots (pg. 13), left→right, each holding a placed **factory's locomotive number** or `null`
   * if unfilled. Filled left-to-right until all 5 are set; thereafter any slot may be replaced (pg. 12).
   * `factories[k]` fills `GAP_LANE_INDICES[k]`; a filled gap is a landing space (a factory) the wrench may
   * move onto (triggering that factory's action) or past. RR5 setup: all `null`.
   */
  readonly factories: readonly (number | null)[];
}

/**
 * One entry in the per-turn **action pool** (pg. 7, 13): a deferred, choiceful **track-move credit** granted
 * this turn (RR5: a factory the wrench moved onto, or the bottom industrialization space's wood-track bonus).
 * Resolvable in any order, partially, and lost at turn end. `RESOLVE_POOL` pops one and opens the
 * pending-moves lock for it (the binding "multi-step choices are engine locks" rule); `SKIP_POOL` forfeits
 * the rest. Choiceless credits (coins) never enter the pool — they auto-resolve when triggered.
 */
export interface PoolEntry {
  /** Stable id within the turn (e.g. `factory:2#0`), used by `RESOLVE_POOL` and the feed. */
  readonly id: string;
  /** How many single track-steps this credit is worth (pg. 13). */
  readonly count: number;
  /** The colours a step may build — a factory credit allows any accessible colour; the bottom space, wood. */
  readonly colors: readonly TrackColor[];
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
  /**
   * The 2 turquoise **temporary** workers this player currently holds (pg. 15): 0 normally, `TEMP_WORKERS`
   * (2) after taking the temp-workers action, usable this round as extra workers (they are also folded into
   * `workersAvailable`). Returned at round end — `resetPlayers` clears this to 0 and `workersAvailable`
   * resets to `workersTotal`, so a temp worker never survives the round (pg. 15). Only one player can hold
   * them at a time (the single action space is occupied once used).
   */
  readonly tempWorkers: number;
  /**
   * Doubler tiles this player has placed on the Trans-Siberian doubler spaces (pg. 14): a count 0…
   * `DOUBLER_SPACES` (8). They fill **left to right**, so a count of _n_ means spaces 1…_n_ are doubled —
   * the scoring phase doubles those Trans-Siberian spaces' points every round. Persists across rounds
   * (tiles stay on the board). Drawn from the shared `supplies.doublers` pool.
   */
  readonly doublers: number;
  /** The three routes, in board order (pg. 6, 8). */
  readonly routes: readonly Route[];
  /** Locomotives owned (pg. 6, 10). RR1: just the starting `#1`. */
  readonly locomotives: readonly Locomotive[];
  /** The industry track (pg. 11–13). RR1: wrench at start. */
  readonly industry: Industry;
  /** Engineers this player has hired (pg. 15–16). RR1: none — hiring lands RR7. */
  readonly hiredEngineers: readonly Engineer[];
  /**
   * The per-turn **action pool** (pg. 7, 13): track-move credits that became available this turn (RR5:
   * factory triggers + the bottom industrialization space; engineer actions join in RR7), resolvable in any
   * order, partially, and **never saved for the next turn**. Only ever non-empty for the seat currently on
   * the clock, and cleared before their turn passes; `resetPlayers` clears it at round end for safety.
   */
  readonly actionPool: readonly PoolEntry[];
  /**
   * This player's held end-bonus card (pg. 22), or `null`. **The game's one secret** — `viewFor` redacts
   * an opponent's to a count. Always `null` in RR1 (drawing end-bonus cards is RR8).
   */
  readonly endBonus: EndBonusCard | null;
  /** The turn-order card dealt to this player (pg. 5): 1–4, lower goes earlier in round 1. */
  readonly turnOrderCard: number;
  /** Whether this player has passed this round (pg. 7). A pass is terminal for the round. */
  readonly passed: boolean;
  /**
   * Cumulative points on the scoring track (pg. 20–21), summed across every round's scoring phase. Starts
   * at 0. **Art ruling #2 (RR2):** the physical track is a 1–100 loop with 100/300/500 **point tiles**
   * beside space 100 (pg. 4 art) for scores past a lap; the engine models the score as one **unbounded
   * integer** and treats the wrap as pure display (track position = `score % 100`, point tiles =
   * `⌊score / 100⌋`), so there is no wrapping logic to get wrong. RR8's final scoring adds to it.
   */
  readonly score: number;
}

/**
 * The pending track-extension lock (pg. 8–9; the binding design decision — the Stone Age `pendingGather` /
 * SP `pendingDraw` pattern). A track-extension `PLACE` sets this on the state; single-step `MOVE_TRACK`
 * actions consume it one space at a time, and **every other action is refused while it is set** (a
 * 409-family error). It always belongs to the active player (only they can hold a lock). `null` when no
 * lock is active.
 */
export interface PendingMoves {
  /** How many single track-steps are still to be resolved (pg. 8–9). Cleared to `null` when it hits 0. */
  readonly remaining: number;
  /**
   * The colours a step may build — the **constraint**. RR2 is always `['wood']` (the only accessible
   * colour); the field is a *set* so RR3's colour access (the coin/bottom spaces offer a choice) drops in
   * without a reshape. A `MOVE_TRACK`'s colour must be one of these.
   */
  readonly colors: readonly TrackColor[];
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
 * The shared locomotive/factory supply (pg. 4, 10–12). One pool, because **a factory is a flipped
 * locomotive** (pg. 11) — the binding "one component model" decision. `stacks` are the per-number piles
 * #2–#9 (each starts at the player count, pg. 12); `tens` are the two distinct #10 piles (pg. 4), which
 * become available **only once the #9 stack is empty** (pg. 10). `returnedFactories` counts locomotives
 * that were flipped to their **factory** side and returned to the supply during an upgrade chain (pg. 11);
 * RR5 draws factories from here (and RR4 only ever *adds* to it via `FLIP_LOCO`).
 */
export interface LocomotiveSupply {
  /** Per-number stacks #2–#9 (pg. 12): `number → remaining`. A number absent/0 is an exhausted stack. */
  readonly stacks: Readonly<Record<number, number>>;
  /** The two #10 stacks (pg. 4, 10), `[a, b]`. Both open only once every #2–#9 stack is empty. */
  readonly tens: readonly [number, number];
  /**
   * Locomotives flipped to their factory side and returned to the supply (pg. 11), **keyed by number** —
   * a factory keeps its number (which decides its indirect action, pg. 13), so RR5 must know *which*
   * factories are available to build (pg. 12: "the lowest-numbered locomotive **or** any returned
   * factory"), not just a count. `number → how many of that factory sit in the supply`; RR4 only ever
   * incremented it, RR5 both adds (a flip) and draws (a factory build).
   */
  readonly returnedFactories: Readonly<Record<number, number>>;
}

/**
 * The general supplies near the board (pg. 6–7). Coins are explicitly **unlimited** (pg. 14: "Coins are
 * not limited"), so they aren't tracked here.
 */
export interface RussianRailroadsSupplies {
  /**
   * Doubler tiles remaining in the shared supply (pg. 7, 14): starts at `DOUBLER_SUPPLY` (30) and is drawn
   * down by the `doubler` action. When it hits 0 the doubler space can no longer be chosen (pg. 14).
   */
  readonly doublers: number;
  /** The shared locomotive/factory supply (pg. 4, 10–12) — per-number stacks + the two #10 piles + returns. */
  readonly locomotives: LocomotiveSupply;
}

/**
 * The pending **locomotive** placement/upgrade lock (pg. 10–11; the SECOND engine-lock kind, alongside
 * `PendingMoves`). Acquiring a locomotive from a loco action space sets this and **keeps the turn**: the
 * active player must resolve the held locomotive before doing anything else (`applyAction` refuses every
 * non-loco-resolution action while it is set). It resolves via `PLACE_LOCO` (onto an empty route slot —
 * ends the chain), `REPLACE_LOCO` (upgrade a lower-numbered loco — the displaced loco becomes the new
 * `PendingLoco`, the "chain reaction" of pg. 11), or `FLIP_LOCO` (turn it to its factory side and return it
 * to the supply — legal **only when no empty locomotive space remains on any board**, pg. 11). It always
 * belongs to the active player. `null` when no loco is held.
 */
export interface PendingLoco {
  /** The printed number of the locomotive currently awaiting placement (pg. 10–11). */
  readonly number: number;
}

/**
 * The pending **factory** placement lock (pg. 12–13; the THIRD engine-lock kind). Set when a
 * locomotive/factory action space is used to build a *factory*: the active player owes one factory
 * placement onto their industry track. It carries no number — the factory tile (the lowest-numbered
 * locomotive **or** any returned factory) is chosen at resolution, so an upgrade earlier in a "loco **and**
 * factory" turn can feed the just-returned factory to this step (pg. 12). Resolved by `PLACE_FACTORY`
 * (fill the leftmost unfilled gap, left-to-right) or `REPLACE_FACTORY` (once all 5 gaps are filled, swap
 * any one — the replaced factory returns to the supply, pg. 12). `null` when no factory is owed.
 */
export interface PendingFactory {
  /** Marker field so the lock is a distinct object; the build has no pre-chosen number (see above). */
  readonly owed: true;
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
  /**
   * The active player's pending track-extension lock (pg. 8–9), or `null`. While set, `applyAction`
   * refuses everything but `MOVE_TRACK` — the single-step resolution of a track-extension action.
   */
  readonly pendingMoves: PendingMoves | null;
  /**
   * The active player's pending **locomotive** placement/upgrade lock (pg. 10–11), or `null`. While set,
   * `applyAction` refuses everything but the loco-resolution actions (`PLACE_LOCO` / `REPLACE_LOCO` /
   * `FLIP_LOCO`). Mutually exclusive with `pendingMoves` — a turn holds at most one lock.
   */
  readonly pendingLoco: PendingLoco | null;
  /**
   * The active player's pending **factory** placement lock (pg. 12–13), or `null`. While set, `applyAction`
   * refuses everything but `PLACE_FACTORY` / `REPLACE_FACTORY`. Set by building a factory from a loco/factory
   * action space; exclusive with the other locks within a single build step.
   */
  readonly pendingFactory: PendingFactory | null;
  /**
   * For the 3-worker "locomotive **and** factory" space (pg. 12): what the active player still owes *after*
   * the current loco/factory build resolves — `'factory'` (loco first, factory next) or `'loco'` (factory
   * first, loco next), else `null`. When a loco or factory placement finishes, this decides whether to open
   * the *other* lock (keeping the turn) or pass. The pg. 12 ordering choice lives entirely here.
   */
  readonly pendingThen: 'loco' | 'factory' | null;
  /** The current round (1-based). */
  readonly round: number;
  /** Total rounds this game (pg. 7, 22–23): 7 at 4 players, 6 at 2–3. */
  readonly rounds: number;
  readonly supplies: RussianRailroadsSupplies;
  readonly version: number;
  readonly log: readonly MoveRecord[];
} & GameEndState<RussianRailroadsResult>;

/**
 * One player's end-of-game result. RR2 fills `total` with the player's **cumulative per-round score**
 * (pg. 20–21) — the real route + industry points summed over every round, so the winner is genuine (highest
 * total; ties share). **Final** scoring (the end-bonus card + engineer majority, pg. 22) is added in RR8,
 * which extends this same field without a state migration.
 */
export interface RussianRailroadsResult {
  readonly playerId: string;
  /** Final score — the cumulative per-round total (RR2); RR8 adds the end-of-game bonuses. */
  readonly total: number;
}
