// Rulebook-sourced constants for Russian Railroads (reference_materials/ultimate_railroads_rulebook-v2_en.pdf,
// Hans im Glück "Ultimate Railroads"). Read the cited page before touching a value — do not encode rules
// from memory. This is the RR1 worker-placement spine; later slices grow the surface.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * Starting workers by player count (pg. 6, "Place 5 workers"; the 2–3-player note, pg. 23: "start with
 * 6 workers instead of 5"). These are the *usable* workers a player owns. The 2 **temporary** turquoise
 * workers are not part of this count — they are taken via the temp-workers action for a single round
 * (RR3, `TEMP_WORKERS`); the one returned worker (pg. 6) is out of scope.
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

/** The five ascending track colours (pg. 8–9). */
export type TrackColor = 'wood' | 'green' | 'bronze' | 'silver' | 'gold';

/** The five track colours in strict build order (pg. 9: wood → green → bronze → silver → gold). */
export const TRACK_COLORS: readonly TrackColor[] = ['wood', 'green', 'bronze', 'silver', 'gold'];

/**
 * The colour-access unlock thresholds (pg. 8–9): the 1-based space a player's **wood** track must
 * **reach or pass on the Trans-Siberian route** to gain access to that colour. RR3 ruling (pg. 8–9,
 * verified against the board art at 300 DPI): green at space 2, bronze at 6, silver at 10, gold at 15 —
 * exactly the grant icons drawn beside those Trans-Siberian spaces, matching the prose ("As soon as you
 * reach or pass space 2 … take the 3 green tracks"; "space 6 … 3 bronze"; "space 10 … 2 silver"; "space
 * 15 … 1 gold"). Access is **global** (once unlocked, the colour is buildable on any route that supports
 * it) and **monotonic** (the wood track only ever advances). The unlock grants **access only** — the
 * tracks go to the player's supply; there is **no** immediate free move on the board (pp. 8–9 grant no
 * moves). Wood needs no threshold (available from setup), so it is absent here.
 */
export const UNLOCK_SPACE: Readonly<Record<Exclude<TrackColor, 'wood'>, number>> = {
  green: 2,
  bronze: 6,
  silver: 10,
  gold: 15,
};

/**
 * The valuation tile (pg. 20) — how many points each colour of track scores per space. **Art ruling #1,
 * LANDED (RR2):** read directly off the pg. 20 valuation-tile art at 400 DPI (also visible on the pg. 6
 * player-board setup): the five stars over the five colours read **0 / 1 / 2 / 4 / 7**. The rulebook text
 * only states green = 1, bronze = 2, wood = 0 in prose; silver = 4 and gold = 7 come from the tile art
 * (the SP0 component-read precedent). RR2 only ever scores wood (= 0), but the full map is encoded now so
 * the scoring rule is complete when the colour ladder arrives in RR3.
 */
export const VALUATION: Readonly<Record<TrackColor, number>> = {
  wood: 0,
  green: 1,
  bronze: 2,
  silver: 4,
  gold: 7,
};

/** The three private routes on the Russian player board (pg. 6, 8). */
export type RouteId = 'transsiberian' | 'stpetersburg' | 'kyiv';

/** One route definition: its id, how many track spaces it has, and which colours it accepts (pg. 8–9). */
export interface RouteDef {
  readonly id: RouteId;
  /** Number of ordered track spaces (pg. 8). The Trans-Siberian is the longest. */
  readonly length: number;
  /**
   * The track colours this route accepts (pg. 9: "Not all routes use all track colors. Your player board
   * shows which colors go with which routes."). **RR3 ruling** (board colour-strip art at 300 DPI):
   * Trans-Siberian all 5, St. Petersburg 4 (no gold), Kyiv 3 (no silver/gold). This reconciles the pg. 3
   * contents count "12 tracks: 3×,3×,3×,2×,1×": each colour appears on exactly as many routes as it has
   * tracks (wood/green/bronze on all 3, silver on 2 = Trans-Sib+St.Pete, gold on 1 = Trans-Sib), so the
   * per-player supply is **emergent** from route availability + the one-tile-per-colour-per-route model —
   * no separate supply count is tracked.
   */
  readonly colors: readonly TrackColor[];
}

/**
 * The three routes, in board order (pg. 8): Trans-Siberian (Moscow→Vladivostok, the long one),
 * St. Petersburg, and Kyiv. Setup seeds space 1 of each with a wood track (pg. 6).
 *
 * **Trans-Siberian length = 15** (RR3): the board shows spaces 1–9 across the top, the corner space 10,
 * then 11–15 down the right edge — long enough to reach the pg. 9 gold threshold at space 15 (verified on
 * the pg. 6 player board at 300 DPI). St. Petersburg / Kyiv lengths (7 / 8) remain the RR2 base-board
 * placeholders — the board art reads 9 / 9, but exact non-Trans-Siberian lengths land with the turn-order
 * / player-board slice (RR6); RR3 only needs the Trans-Siberian thresholds, and the shorter placeholders
 * cost nothing (the colour ladder is gated on the Trans-Siberian wood track).
 */
export const ROUTES: readonly RouteDef[] = [
  { id: 'transsiberian', length: 15, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] },
  { id: 'stpetersburg', length: 7, colors: ['wood', 'green', 'bronze', 'silver'] },
  { id: 'kyiv', length: 8, colors: ['wood', 'green', 'bronze'] },
];

/** The colours a given route accepts (pg. 9), or `[]` for an unknown id. */
export const routeColors = (routeId: RouteId): readonly TrackColor[] =>
  ROUTES.find((r) => r.id === routeId)?.colors ?? [];

/** Which section of the board an action space belongs to (pg. 7). */
export type ActionSpaceKind = 'coins' | 'track' | 'doubler' | 'temp-workers' | 'locomotive';

/**
 * Locomotive supply (pg. 4, 10, 12). Locomotives are numbered **#2–#10** in the supply (the #1 every
 * player starts with, pg. 6, is *not* in the supply). They are sorted into per-number stacks; **each stack
 * holds one locomotive per player** (pg. 12: "the same number of locomotives in it as the number of
 * players — i.e. 4× #2, 4× #3 … in a 4-player game"). So the "4 each" in a 4-player game is the general
 * `count`-per-stack rule; `initialLocoSupply(count)` sets it (a 2-player game has 2 of each).
 *
 * **Ruling (RR4, pg. 12).** The scope brief said "#2–#9 (4 each) + two #10 (4+4)"; the rulebook (pg. 12) is
 * explicit that a stack holds *player-count* locomotives, so the model is `count`-per-stack — which **is**
 * 4 each at 4 players (the brief's case) and correctly scales to 2/3 players. The **two #10 stacks** are a
 * real component split (pg. 4: "There are two kinds of #10 locomotives … sort these into separate piles";
 * they differ only in their *factory* action, pg. 48 — irrelevant until RR5), and **both open only once the
 * #9 stack is empty** (pg. 10, the "!" note). One #9 goes onto an idea card at setup (pg. 4) — an idea-card
 * detail deferred to RR6; RR4 keeps the full `count` in the #9 stack.
 */
export const LOCO_STACK_NUMBERS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9];

/** The number every #10 locomotive prints (pg. 4, 10). Both #10 stacks carry this reach. */
export const LOCO_TEN = 10;

/**
 * How many locomotives a route can hold (pg. 10): **2** on the Trans-Siberian (their reaches sum), **1** on
 * St. Petersburg and Kyiv. Placing a loco needs an empty slot here; a full route can only be *upgraded*
 * (replace a lower-numbered loco).
 */
export const LOCO_CAPACITY: Readonly<Record<RouteId, number>> = {
  transsiberian: 2,
  stpetersburg: 1,
  kyiv: 1,
};

/**
 * Doubler tiles (pg. 14). The shared supply is **30** tiles; a base-game player board has doubler spaces
 * above the **Trans-Siberian** route only. The board art (pg. 6, 300 DPI) shows **8** doubler spaces,
 * aligned above Trans-Siberian spaces 1–8; you fill them **left to right**, ≤ 1 tile per space, and a
 * doubler over space _i_ doubles the points that space scores each round (pg. 14, 20).
 */
export const DOUBLER_SUPPLY = 30;
export const DOUBLER_SPACES = 8;

/** The 2 turquoise **temporary** workers a player takes with the temp-workers action (pg. 15). */
export const TEMP_WORKERS = 2;

/**
 * The track-extension payload of an action space (pg. 8–9): placing on it grants `moves` single track
 * steps under a pending lock, each constrained to one of `colors`. The board has a dedicated space per
 * colour; RR2 ships only the wood-buildable subset (the colour ladder + the green/bronze/silver/gold
 * spaces land RR3), but `colors` is a *set* from day one so the constraint field is designed for the
 * colour choice that arrives then (the bottom space is wood-or-green, the coin space is any colour).
 */
export interface TrackExtension {
  /** The colours this space may build (pg. 9). A step's colour must be one of these ∩ the player's access. */
  readonly colors: readonly TrackColor[];
  /** How many single-space track moves the space grants (pg. 8–9, read off the board art — see below). */
  readonly moves: number;
}

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
   * Coins that **must** be paid in addition to the worker(s) — the pg. 9 worker+coin track space
   * ("you must place both a worker and a coin"). Distinct from the coin *substitution* of pg. 14: this
   * coin is mandatory and the worker cannot itself be paid with a coin. Absent/0 on every other space.
   */
  readonly coinCost?: number;
  /** Present iff this is a track-extension space (pg. 8–9): placing sets a pending-moves lock. */
  readonly track?: TrackExtension;
  /**
   * Whether this space **never becomes occupied** — the bottom Track Extension space (pg. 9), the one
   * space any number of workers may use in a round. Every other space is occupied (blocked for the round)
   * the instant a worker or coin lands on it (pg. 7).
   */
  readonly neverOccupies: boolean;
}

/**
 * How many track moves each colour's dedicated single-/double-worker action space grants (pg. 8–9). Read
 * directly off the main board art (pp. 4–5, at 300 DPI) — the number of track tiles drawn in each space:
 * wood/green give **2 / 3** for one / two workers; bronze/silver/gold give **1 / 2**. (Wood is the pg. 8
 * example: 2 workers → 3 moves.)
 */
export const COLOR_MOVES: Readonly<Record<TrackColor, { readonly one: number; readonly two: number }>> = {
  wood: { one: 2, two: 3 },
  green: { one: 2, two: 3 },
  bronze: { one: 1, two: 2 },
  silver: { one: 1, two: 2 },
  gold: { one: 1, two: 2 },
};

/** A dedicated single-colour track-extension space (pg. 8–9): `n` workers → `moves` moves of `color`. */
function colorSpace(color: TrackColor, workers: 1 | 2, moves: number): ActionSpaceDef {
  return {
    id: `track-${color}-${workers}`,
    label: `Build ${color} — ${moves} move${moves > 1 ? 's' : ''}`,
    kind: 'track',
    workers,
    track: { colors: [color], moves },
    neverOccupies: false,
  };
}

/**
 * The action spaces the track/auxiliary sections of the board expose (pg. 7–9, 14–15). Move counts and
 * worker costs are read directly off the main board art (pp. 4–5, at 300 DPI) and cross-checked against
 * the pg. 8 example:
 *
 *  - `coins` — take 2 coins for 1 worker (pg. 14).
 *  - `track-<colour>-1` / `track-<colour>-2` — the dedicated per-colour spaces (rows 1–5): wood/green
 *    1w→2 · 2w→3, bronze/silver/gold 1w→1 · 2w→2 (see `COLOR_MOVES`). A space is only *usable* once its
 *    colour is unlocked (the `accessibleColors` gate) — the higher-colour spaces sit idle until the wood
 *    track passes the pg. 8–9 threshold, exactly as the physical board's colours become buildable.
 *  - `track-coin` — 1 worker **+ 1 coin** → **2** moves of any *accessible* colour (pg. 9, "two lower
 *    track extension actions").
 *  - `track-bottom` — the never-occupied bottom space: 1 worker → **1** move of wood **or** green (pg. 9).
 *  - `doubler` — 1 worker → take a doubler tile onto the leftmost empty Trans-Siberian doubler space
 *    (pg. 14).
 *  - `temp-workers` — 1 worker → take the 2 turquoise temporary workers for the round (pg. 15).
 */
export const ACTION_SPACES: readonly ActionSpaceDef[] = [
  { id: 'coins', label: 'Take 2 coins', kind: 'coins', workers: 1, neverOccupies: false },
  colorSpace('wood', 1, COLOR_MOVES.wood.one),
  colorSpace('wood', 2, COLOR_MOVES.wood.two),
  colorSpace('green', 1, COLOR_MOVES.green.one),
  colorSpace('green', 2, COLOR_MOVES.green.two),
  colorSpace('bronze', 1, COLOR_MOVES.bronze.one),
  colorSpace('bronze', 2, COLOR_MOVES.bronze.two),
  colorSpace('silver', 1, COLOR_MOVES.silver.one),
  colorSpace('silver', 2, COLOR_MOVES.silver.two),
  colorSpace('gold', 1, COLOR_MOVES.gold.one),
  colorSpace('gold', 2, COLOR_MOVES.gold.two),
  {
    id: 'track-coin',
    label: 'Build track — 2 moves (worker + coin)',
    kind: 'track',
    workers: 1,
    coinCost: 1,
    track: { colors: TRACK_COLORS, moves: 2 },
    neverOccupies: false,
  },
  {
    id: 'track-bottom',
    label: 'Build wood/green — 1 move',
    kind: 'track',
    workers: 1,
    track: { colors: ['wood', 'green'], moves: 1 },
    neverOccupies: true,
  },
  { id: 'doubler', label: 'Take a doubler', kind: 'doubler', workers: 1, neverOccupies: false },
  { id: 'temp-workers', label: 'Take 2 temporary workers', kind: 'temp-workers', workers: 1, neverOccupies: false },
  // The two RR4 locomotive action spaces (pg. 12): 1 worker and 2 workers, each acquires the lowest-numbered
  // locomotive and opens the placement/upgrade lock. **RR4 ruling (pg. 12–13):** the board's upper/middle
  // spaces are "loco **or** factory"; RR4 ships the *locomotive* option only, and the third (3-worker) space
  // — "1 locomotive **and** 1 factory" — and the factory option both wait for **RR5**, because building a
  // factory means placing it on the *industry track* (the wrench / left-to-right gaps, pg. 13), which RR5
  // owns. Same "add only spaces usable this slice" discipline RR2/RR3 used for the colour spaces.
  { id: 'loco-1', label: 'Build locomotive', kind: 'locomotive', workers: 1, neverOccupies: false },
  { id: 'loco-2', label: 'Build locomotive', kind: 'locomotive', workers: 2, neverOccupies: false },
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
