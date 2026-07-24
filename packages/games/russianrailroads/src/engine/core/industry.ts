// The industry track + factory-action data (rulebook pp. 11–14, 21, and the pg. 6 / pg. 13 board art).
// Read the cited pages before touching a value — this is the RR5 industrialization slice.
//
// ─── ART RULING (RR5): the industry-track layout ─────────────────────────────────────────────────────
// The rulebook prose (pg. 13) only *describes* the track ("after the first 4 spaces you come to a gap";
// "5 gaps"; "the end space"); the actual point values + gap positions are a **component read** of the
// pg. 6 player board (rendered at 300 DPI and cross-checked against the pg. 13 diagram and the pg. 21
// scoring example). The wrench starts on the START space (pg. 6, step 6) and moves right toward the end.
//
// The track is a hairpin on the physical board (START tucked top, space 1 to its left, then a run along
// the bottom), but *logically* it is a single ascending lane. Read left→right in play order:
//
//   idx  0   1   2   3   4    5     6    7     8    9      10     11    12    13    14   15
//        ─────────────────  ────  ──── ────  ──── ────  ──────  ────  ──── ────  ──── ────
//   pts  0   1   2   3   5   GAP1  10  GAP2  15  GAP3  (blank) GAP4  20  GAP5  25   50
//
//   • The **first 4 spaces** after START are 1 / 2 / 3 / 5 — then GAP 1 (pg. 13 "after the first 4"). The
//     pg. 21 scoring example (wrench on a factory in the first gap → scores 5, "the previous space")
//     confirms the 5-space sits immediately before GAP 1.
//   • **5 gaps** total (pg. 13), at lane indices 5 / 7 / 9 / 11 / 13. A gap must be filled by a **factory**
//     before the wrench can move onto (or past) it (pg. 13: "cannot move onto the gap and cannot skip it").
//   • idx 10 is a **numberless** landing space (it carries the pg. 6 light-bulb / idea-token marker — an
//     RR6 concern). Like a factory, a numberless space scores the previous numbered space (pg. 21), so it
//     scores 15 here. It is a normal landing space for movement (not a gap).
//   • idx 15 (50) is the **end space** (pg. 13 "you cannot reach the end until all 5 gaps are filled" — it
//     sits past GAP 5, so all five must be filled to reach it). It too carries an idea-token marker (RR6).
//   • The silver-4 / gold-7 style "the number is the printed points" read matches VALUATION's precedent.

import type { TrackColor } from './constants';

/** One lane entry on the industry track: a landing **space** (with printed points), or a **gap** (pg. 13). */
export type IndustryEntry =
  | {
      readonly kind: 'space';
      /** Printed point value the wrench scores when it rests here (pg. 21); `null` = a numberless space. */
      readonly points: number | null;
    }
  | { readonly kind: 'gap' };

/**
 * The industry-track lane in play order (pg. 6 board art — see the file header). Index 0 is the START
 * space the wrench begins on; the wrench position (`Industry.wrench`) is an index into this array. Shared
 * and immutable — a player's *filled* gaps live in their own `Industry.factories`, not here.
 */
export const INDUSTRY_LANE: readonly IndustryEntry[] = [
  { kind: 'space', points: 0 }, // 0  START
  { kind: 'space', points: 1 }, // 1  ┐
  { kind: 'space', points: 2 }, // 2  │ the "first 4 spaces" (pg. 13)
  { kind: 'space', points: 3 }, // 3  │
  { kind: 'space', points: 5 }, // 4  ┘
  { kind: 'gap' }, //             5  GAP 1
  { kind: 'space', points: 10 }, // 6
  { kind: 'gap' }, //             7  GAP 2
  { kind: 'space', points: 15 }, // 8
  { kind: 'gap' }, //             9  GAP 3
  { kind: 'space', points: null }, // 10  numberless (idea-token space, RR6) — scores the previous number
  { kind: 'gap' }, //             11 GAP 4
  { kind: 'space', points: 20 }, // 12
  { kind: 'gap' }, //             13 GAP 5
  { kind: 'space', points: 25 }, // 14
  { kind: 'space', points: 50 }, // 15  END (idea-token space, RR6)
];

/** The lane indices of the 5 gaps, in order (pg. 13). `factories[k]` fills `GAP_LANE_INDICES[k]`. */
export const GAP_LANE_INDICES: readonly number[] = INDUSTRY_LANE.reduce<number[]>((acc, e, i) => {
  if (e.kind === 'gap') acc.push(i);
  return acc;
}, []);

/** How many gaps the industry track has (pg. 13: 5). The player fills them left→right with factories. */
export const INDUSTRY_GAPS = GAP_LANE_INDICES.length;

/** The last (end) lane index (pg. 13). Reachable only once all 5 gaps are filled. */
export const INDUSTRY_END = INDUSTRY_LANE.length - 1;

/**
 * The points the wrench scores at lane index `i` (pg. 21): the printed value there, or — on a factory (a
 * filled gap) or a numberless space — "the points shown on the previous space". Walks back to the nearest
 * numbered space; START (index 0 = 0 points) guarantees termination.
 */
export function industryPointsAt(i: number): number {
  for (let j = Math.min(i, INDUSTRY_END); j >= 0; j -= 1) {
    const e = INDUSTRY_LANE[j]!;
    if (e.kind === 'space' && e.points != null) return e.points;
  }
  return 0;
}

// ─── ART RULING (RR5): the per-factory indirect actions ──────────────────────────────────────────────
// The scope brief expected pg. 48 to tabulate the factory actions. **It does not** — pg. 48 is the
// *engineer* reference (the tiles there carry engineer portraits). Each factory's action is instead a tiny
// icon in the **top-left corner of its locomotive tile** (pg. 11: "shown as a reminder"), and the rulebook
// gives *no* prose table (only pg. 11–12's note that all four of a level share one action and the two #10s
// differ). Read off the pg. 10 locomotive-supply art at 300 DPI, the icons are only partly legible:
//   • #2 — a framed track tile  → "advance a track"      (confident)
//   • #3 — a pennant + arrow     → "advance a track"      (confident: the game's move-a-track glyph)
//   • #6 — a gold coin           → "gain a coin"          (confident)
//   • #4 light-bulb / #9 red card → idea token / bonus card → **future mechanics** (RR6 / RR8)
//   • #1, #5, #7, #8, #10 — illegible / clearly future-mechanic
// FAITHFULNESS RULING: encode the **confidently-read** icons as real, RR5-resolvable actions; mark the
// rest **inert** (granted to the pool but not resolvable → "lost", pg. 13) with a documented note, rather
// than invent a firm rule from an unreadable icon. This keeps the trigger/pool machinery real and tested
// and is trivially corrected against physical tiles in RR9 (art polish). See the ROADMAP RR5 ruling.

/**
 * A factory's indirect action (pg. 13: received when the wrench moves onto it). The RR5-resolvable kinds:
 *  - `moveTrack` — advance `count` track(s) (resolved via the pending-moves lock, the binding design rule);
 *  - `coins`     — gain `count` coins (choiceless → auto-resolved when triggered);
 *  - `inert`     — the printed action needs a mechanic that doesn't exist yet (an art read that resolves to
 *                  a future slice, or an illegible icon); granted but immediately lost (pg. 13), `note` says why.
 */
export type FactoryAction =
  | { readonly kind: 'moveTrack'; readonly count: number }
  | { readonly kind: 'coins'; readonly count: number }
  | { readonly kind: 'inert'; readonly note: string };

/** The colours a factory `moveTrack` credit may build — any accessible colour (the generic move-a-track icon). */
export const FACTORY_MOVE_COLORS: readonly TrackColor[] = ['wood', 'green', 'bronze', 'silver', 'gold'];

/**
 * Factory action by locomotive number 1–10 (pg. 13, 48 — see the art ruling above). The confidently-read
 * icons (#2/#3 track, #6 coin) are real; every other number is `inert` with a documented reason. A number
 * absent from the readable set is treated as inert by `factoryAction`, so the table never gates a build.
 */
export const FACTORY_ACTIONS: Readonly<Record<number, FactoryAction>> = {
  1: { kind: 'inert', note: '#1 factory icon not legible in the rulebook art — reconcile in RR9' },
  2: { kind: 'moveTrack', count: 1 },
  3: { kind: 'moveTrack', count: 1 },
  4: { kind: 'inert', note: '#4 icon reads as an idea token — lands with idea tokens (RR6)' },
  5: { kind: 'inert', note: '#5 factory icon not legible in the rulebook art — reconcile in RR9' },
  6: { kind: 'coins', count: 1 },
  7: { kind: 'inert', note: '#7 factory icon not legible in the rulebook art — reconcile in RR9' },
  8: { kind: 'inert', note: '#8 factory icon not legible in the rulebook art — reconcile in RR9' },
  9: { kind: 'inert', note: '#9 icon reads as a bonus/idea card — lands with end-bonus scoring (RR8)' },
  10: { kind: 'inert', note: 'the two #10 factory actions are not tabulated in the rulebook — reconcile in RR9' },
};

/** The factory action for locomotive `number` (pg. 13); unknown numbers are inert (never gates a build). */
export function factoryAction(number: number): FactoryAction {
  return FACTORY_ACTIONS[number] ?? { kind: 'inert', note: `#${number} factory has no documented action` };
}
