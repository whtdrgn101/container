// The engineer catalog (rulebook pp. 5, 15–16, 22, 48). Read the cited page before touching a value.
//
// Russian Railroads ships **14 engineers numbered 2–15**. At setup they are sorted into two lettered
// stacks (A and B) plus **one engineer with no letter**, which goes onto its idea card with a coin
// (pg. 5). The lettered stacks are each shuffled; the strip is then dealt from them (see `internal/setup`).
//
// ─── HIRING & USE MODEL (RR7, pg. 7, 15) ─────────────────────────────────────────────────────────────
// The engineers section of the board is a **strip** (pg. 15): from the right, one **hiring space**, then two
// **variable action spaces**, then the **left-hand spaces** (future engineers). The strip slides one space
// right each round (pg. 22 — see `slideEngineerStrip`). Three ways an engineer's action reaches play:
//   1. **Hiring** (pg. 15): each round exactly one engineer (the right-most, the hiring space) is hireable
//      for **1 coin**; you take it beside your board and its action becomes YOUR **private indirect action**,
//      usable **once per round** (`RussianRailroadsPlayer.usedEngineers` is the per-round flag). Being indirect
//      (pg. 7, 15), a track-move action feeds the **action pool** (partially resolvable / skippable); an
//      immediate effect (coins / points) resolves at once. Modelled as a `USE_ENGINEER` turn.
//   2. **The two variable action spaces** (pg. 15–16): the two horizontal engineers left of the hiring space
//      are public **direct** action spaces anyone may use for **1 worker**, fully resolved, once per round
//      (occupied like any space). Modelled as a `USE_VARIABLE_ENGINEER` turn. A track-move here opens the
//      **pending-moves lock directly** (direct = must resolve, not skippable).
//   3. **Removal** (pg. 22): an unclaimed hiring-space engineer is returned to the box when the strip slides
//      (falls off the right end — `slideEngineerStrip`); a hired one has already left the strip.
//
// ─── ART / FAITHFULNESS RULING (RR7): the pg. 48 engineer catalog ────────────────────────────────────
// pg. 48 ("Engineers, Locomotives, and Factories") is the engineer *reference* — its portrait tiles describe
// the engineer actions (the RR5 discovery). But it does **not** tabulate action-against-printed-number: the
// numbers 2–15 exist only on the tiles for the pg. 22 majority tiebreak, and the pg. 48 tiles are not
// legibly tied to specific numbers at this DPI. So, exactly the RR5 `FACTORY_ACTIONS` / RR6 idea-card
// precedent: the **actions themselves are read off pg. 48 (and the pg. 15 variable-engineer example)** and
// cited per entry, while the **number → action assignment is a documented ADAPTED read** (reconcile against
// physical tiles in RR9). Every action that maps to existing machinery is LIVE; the three that reference a
// mechanic RR7 does not build — a per-round occupancy replay, cross-player interaction, and end-bonus-card
// scoring — are typed **inert** (hireable, count for majority, but their action is non-resolvable) with a
// note, rather than invent firm rules. The pg. 48 tiles encoded below:
//   • "Move N tracks 1 space each" / "move a green track behind the bronze"  → `moveTrack`   (LIVE)
//   • the pg. 15 variable-engineer example ("take a doubler tile … also score 5 points") → `doubler` (LIVE)
//   • "a bit stronger [coins] action" (pg. 15: engineer actions mirror the board, stronger) → `coins` (LIVE)
//   • "Score X points" star tiles                                            → `score`       (LIVE)
//   • "Score the sum of the numbers of all of your engineers"               → `scoreEngineers` (LIVE)
//   • "Score the sum of your 2 highest-number locomotives"                  → `scoreLocomotives` (LIVE)
//   • "Repeat a previously-occupied single-worker action" (pg. 48)          → inert (occupancy replay, RR9)
//   • "Use another player's engineer action space" (pg. 48, 2-player)       → inert (cross-player, RR9)
//   • "Choose another end bonus card, or score 10" (pg. 48)                 → `endBonus` (LIVE, RR8)

import { TRACK_COLORS } from './constants';
import type { TrackColor } from './constants';

/**
 * An engineer's action (pg. 15–16, 48). Mirrors the `FactoryAction` shape (a typed union of what an indirect
 * action can *do*). The LIVE kinds map onto existing machinery; `inert` is a printed action whose faithful
 * resolution needs a mechanic RR7 does not build (see the ruling above) — hireable and majority-counting, but
 * not resolvable (`note` says why). RR8/RR9 replace the inert entries.
 */
export type EngineerAction =
  | { readonly kind: 'moveTrack'; readonly count: number; readonly colors: readonly TrackColor[] }
  | { readonly kind: 'coins'; readonly count: number }
  | { readonly kind: 'doubler'; readonly points: number }
  | { readonly kind: 'score'; readonly points: number }
  | { readonly kind: 'scoreEngineers' }
  | { readonly kind: 'scoreLocomotives' }
  // Engineer #15 (pg. 48, LIVE in RR8): "choose another end bonus card, or score 10." The choice rides on
  // the `USE_ENGINEER` / `USE_VARIABLE_ENGINEER` action's `option`: `'draw'` draws the top end-bonus card
  // (the pg. 46 draw-top ruling), `'score'` (the default) takes `points` immediately.
  | { readonly kind: 'endBonus'; readonly points: number }
  | { readonly kind: 'inert'; readonly note: string };

/** Which shuffled stack an engineer belongs to. `idea` is the single letterless engineer (pg. 5). */
export type EngineerStack = 'A' | 'B' | 'idea';

/** One engineer **definition** — the printed data (id, number, stack, and its pg. 48 action). */
export interface Engineer {
  /** Stable id, e.g. `eng-7`. */
  readonly id: string;
  /** Printed number 2–15 (the engineer-majority tiebreak reads the highest, pg. 22). */
  readonly number: number;
  /** The stack this engineer is sorted into at setup (pg. 5). */
  readonly stack: EngineerStack;
  /** The engineer's action (pg. 48; the number → action assignment is ADAPTED — see the file header). */
  readonly action: EngineerAction;
}

/**
 * The 14 engineers, numbered 2–15 (pg. 5). One is letterless (`idea`); the remaining 13 split into the
 * A and B stacks. ADAPTED split (see the file header): 7 into B, 6 into A, so a 4-player deal (top 4 of
 * B + top 3 of A) and a 2/3-player deal (3 of each) both have enough in each stack. The `action` per number
 * is the documented ADAPTED pg. 48 read (RR9 reconciles the exact number ↔ action).
 */
export const ENGINEERS: readonly Engineer[] = [
  // The letterless engineer → its idea card (pg. 5); its action still stands should a path ever grant it.
  { id: 'eng-2', number: 2, stack: 'idea', action: { kind: 'moveTrack', count: 1, colors: ['green'] } },
  { id: 'eng-3', number: 3, stack: 'B', action: { kind: 'moveTrack', count: 3, colors: TRACK_COLORS } },
  { id: 'eng-4', number: 4, stack: 'A', action: { kind: 'moveTrack', count: 2, colors: TRACK_COLORS } },
  { id: 'eng-5', number: 5, stack: 'B', action: { kind: 'coins', count: 3 } },
  { id: 'eng-6', number: 6, stack: 'A', action: { kind: 'coins', count: 2 } },
  { id: 'eng-7', number: 7, stack: 'B', action: { kind: 'doubler', points: 5 } }, // pg. 15 variable example
  { id: 'eng-8', number: 8, stack: 'A', action: { kind: 'score', points: 5 } },
  { id: 'eng-9', number: 9, stack: 'B', action: { kind: 'score', points: 8 } },
  { id: 'eng-10', number: 10, stack: 'A', action: { kind: 'scoreLocomotives' } },
  { id: 'eng-11', number: 11, stack: 'B', action: { kind: 'scoreEngineers' } },
  { id: 'eng-12', number: 12, stack: 'A', action: { kind: 'moveTrack', count: 2, colors: TRACK_COLORS } },
  {
    id: 'eng-13',
    number: 13,
    stack: 'B',
    action: {
      kind: 'inert',
      note: 'repeat a previously-occupied single-worker action (pg. 48) — occupancy replay, RR9',
    },
  },
  {
    id: 'eng-14',
    number: 14,
    stack: 'A',
    action: {
      kind: 'inert',
      note: "use another player's engineer action space (pg. 48, 2-player) — cross-player, RR9",
    },
  },
  // #15 goes LIVE in RR8: "choose another end bonus card, or score 10" (pg. 48). See `EngineerAction`.
  { id: 'eng-15', number: 15, stack: 'B', action: { kind: 'endBonus', points: 10 } },
];

/** How much a hire costs (pg. 15: "place a coin onto the space"). */
export const HIRE_COST = 1;

/** How many workers a variable engineer action space costs (pg. 15 example: "place 1 worker"). */
export const VARIABLE_ENGINEER_WORKERS = 1;
