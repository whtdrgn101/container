// Rulebook-sourced constants for Russian Railroads (reference_materials/ultimate_railroads_rulebook-v2_en.pdf,
// Hans im Glück "Ultimate Railroads"). Read the cited page before touching a value — do not encode rules
// from memory. This is the RR1 worker-placement spine; later slices grow the surface.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * Starting workers by player count (pg. 6, "Place 5 workers"; the 2–3-player note, pg. 23: "start with
 * 6 workers instead of 5"). These are the *usable* workers; the 2 temporary workers and the returned
 * one (pg. 6) are RR3 / out of scope.
 */
export const STARTING_WORKERS: Readonly<Record<number, number>> = { 2: 6, 3: 6, 4: 5 };

/**
 * Starting coins by player count (pg. 6: "You start the game with 1 coin"; pg. 23: 2 players "start with
 * 2 coins instead of 1"). 3 players is unmentioned there, so it keeps the base value of 1.
 */
export const STARTING_COINS: Readonly<Record<number, number>> = { 2: 2, 3: 1, 4: 1 };

/** Rounds by player count (pg. 7 "The game lasts 7 rounds"; pg. 23 "Play only 6 rounds" at 2–3 players). */
export const ROUNDS: Readonly<Record<number, number>> = { 2: 6, 3: 6, 4: 7 };

/** The take-2-coins action space hands out this many coins (pg. 14). */
export const COINS_PER_ACTION = 2;

/** The number of end-bonus cards returned to the box **unseen** at setup (pg. 5). */
export const END_BONUS_REMOVED_UNSEEN = 2;

/**
 * How many engineers to deal onto the strip from each stack, by player count.
 *
 *  - **4 players** (pg. 5): top **4 from B** + top **3 from A** = 7 filled slots.
 *  - **2 players** (pg. 23): 3 A + 3 B = 6 filled slots (the board's 2-player side has 6 spaces).
 *  - **3 players** (pg. 23): 3 A + 3 B = 6 engineers, with the **left-most strip space left empty** (a
 *    7-slot strip, so `internal/setup` prepends a `null`).
 */
export const ENGINEER_DEAL: Readonly<Record<number, { readonly a: number; readonly b: number }>> = {
  2: { a: 3, b: 3 },
  3: { a: 3, b: 3 },
  4: { a: 3, b: 4 },
};

/** The five ascending track colours (pg. 8–9). RR1 only ever places `wood` (the starting track). */
export type TrackColor = 'wood' | 'green' | 'bronze' | 'silver' | 'gold';

/** The three private routes on the Russian player board (pg. 6, 8). */
export type RouteId = 'transsiberian' | 'stpetersburg' | 'kyiv';

/** One route definition: its id and how many track spaces it has (pg. 8). */
export interface RouteDef {
  readonly id: RouteId;
  /** Number of ordered track spaces (pg. 8). The Trans-Siberian is the longest. */
  readonly length: number;
}

/**
 * The three routes, in board order (pg. 8): Trans-Siberian (Moscow→Vladivostok, the long one),
 * St. Petersburg, and Kyiv. RR1 seeds space 1 of each with a wood track (pg. 6) and never advances them;
 * the full ladder, thresholds and exact lengths are RR3/RR6 (the lengths here are the base-board counts).
 */
export const ROUTES: readonly RouteDef[] = [
  { id: 'transsiberian', length: 10 },
  { id: 'stpetersburg', length: 7 },
  { id: 'kyiv', length: 8 },
];

/** Which section of the board an action space belongs to (pg. 7). RR1 uses two. */
export type ActionSpaceKind = 'coins' | 'track';

/** One shared action-space definition (pg. 7). */
export interface ActionSpaceDef {
  /** Stable id, used by `PLACE` and in URLs/testids. */
  readonly id: string;
  /** Human-readable label for the UI. */
  readonly label: string;
  readonly kind: ActionSpaceKind;
  /** Workers (or coin-substitutes) required to place here (pg. 7: 1, 2, or 3). */
  readonly workers: number;
  /**
   * Whether this space **never becomes occupied** — the bottom Track Extension space (pg. 9), the one
   * space any number of workers may use in a round. Every other space is occupied (blocked for the round)
   * the instant a worker or coin lands on it (pg. 7).
   */
  readonly neverOccupies: boolean;
}

/**
 * The action spaces RR1 models (pg. 7). Two bootstrap spaces:
 *  - `coins` — take 2 coins for 1 worker (pg. 14).
 *  - `track-bottom` — the never-occupied bottom track-extension space: 1 worker → +1 wood step on a route
 *    of choice (pg. 9). RR1 implements only its **no-occupy** rule; the actual track move lands in RR2.
 *
 * The rest of the board (the other track spaces, locomotives, industrialization, doublers, engineers, the
 * turn-order track) arrives one slice at a time.
 */
export const ACTION_SPACES: readonly ActionSpaceDef[] = [
  { id: 'coins', label: 'Take 2 coins', kind: 'coins', workers: 1, neverOccupies: false },
  { id: 'track-bottom', label: 'Track extension (+1 wood)', kind: 'track', workers: 1, neverOccupies: true },
];

/** Look up an action-space definition by id, or `undefined` if none. */
export const actionSpace = (id: string): ActionSpaceDef | undefined => ACTION_SPACES.find((s) => s.id === id);

/**
 * The end-bonus cards (pg. 5, 22, 47). The real per-card scoring lands in RR8 (and resolves the pg. 46
 * draw-vs-pick ambiguity); RR1 needs only a shuffled pile with 2 removed unseen, redacted to a count.
 * ADAPTED count/ids (a documented placeholder set — see the ROADMAP art-ruling convention); each carries
 * a stub scoring id filled in at RR8.
 */
export interface EndBonusCard {
  readonly id: string;
  /** The scoring rule this card applies at game end — a stub until RR8. */
  readonly rule: 'placeholder';
}

/** A modest end-bonus deck (ADAPTED, pg. 5) — enough to shuffle, remove 2, and hold a pile. Real set: RR8. */
export const END_BONUS_CARDS: readonly EndBonusCard[] = [
  { id: 'bonus-1', rule: 'placeholder' },
  { id: 'bonus-2', rule: 'placeholder' },
  { id: 'bonus-3', rule: 'placeholder' },
  { id: 'bonus-4', rule: 'placeholder' },
  { id: 'bonus-5', rule: 'placeholder' },
  { id: 'bonus-6', rule: 'placeholder' },
  { id: 'bonus-7', rule: 'placeholder' },
  { id: 'bonus-8', rule: 'placeholder' },
];

/** The starting locomotive every player has placed at setup (pg. 6, step 3). */
export const STARTING_LOCOMOTIVE = 1;
