// The player-board **special spaces** along the three routes (rulebook pp. 18–19), encoded as data.
//
// ─── ART RULING (RR6): the route special-space layout ────────────────────────────────────────────────
// The rulebook prose (pp. 18–19) describes the special *types* but not which space on which route carries
// which one — that is a **component read** of the pg. 6 player board (rendered at 400 DPI and cross-checked
// against the pp. 18–19 diagram and the two worked examples). The readings below are documented per space:
//
//   Trans-Siberian (length 15):
//     • space 2  — new-track GREEN grant   (wood prereq; see note ‡)
//     • space 3  — NEW WORKER, needs loco  (red-bordered wood+worker icon, pg. 19 "also require a loco")
//     • space 6  — new-track BRONZE grant  (wood prereq; note ‡)
//     • space 10 — new-track SILVER grant  (corner space; wood prereq; note ‡)
//     • space 13 — IDEA TOKEN, needs loco  (light-bulb in a dashed ring, pg. 19)
//     • space 15 — new-track GOLD grant + END-STATION KEY (wood prereq for gold; key on reaching the end)
//   St. Petersburg (length 9):
//     • space 4  — IDEA TOKEN, needs loco  (pg. 19 worked example: "#5 loco … move onto space 4")
//     • space 6  — IDEA TOKEN, needs loco
//     • space 7  — ROUTE DOUBLING (green track + loco → ×2, pg. 19; the green ×2 shield)
//     • space 9  — END-STATION KEY (the route end; the St. Petersburg emblem follows it)
//   Kyiv (length 9):
//     • spaces 1–4 — BONUS STARS 1/2/3/4, need loco (pg. 19 worked example: space 3 + #3 loco → 1+2+3 = 6)
//     • space 7  — NEW WORKER (wood only; a plain flag, no red border — the pg. 19 "does not require a loco")
//     • space 9  — END-STATION KEY (the route end)
//
// ‡ The **new-track grants** (green 2 / bronze 6 / silver 10 / gold 15 on the Trans-Siberian) are *already*
//   modelled — RR3 computes colour access from the wood frontier via `UNLOCK_SPACE` (identical thresholds),
//   which the board art here confirms are printed special spaces. They are therefore **not** re-encoded as
//   fired specials below (that would double the mechanism); `SPECIALS` carries only the *other* benefit
//   types, whose one-time firing / persistent scoring RR6 adds. The route lengths (St. Pete / Kyiv = 9)
//   fix the RR2/RR3 placeholders (7 / 8) — see `ROUTES` in constants.ts.

import type { RouteId, TrackColor } from './constants';

/** The kinds of player-board special space RR6 models (pp. 18–19). New-track grants are the RR3 unlocks (‡). */
export type SpecialType = 'new-worker' | 'key' | 'idea-token' | 'route-doubling' | 'bonus-star';

/**
 * One printed special space on a route (pp. 18–19). Fired the moment its **prerequisite** is met (pg. 18:
 * reach it with your **wood** track — and, when `requiresLoco`, also reach it with a locomotive; and, for
 * route-doubling, reach it with your **green** track). The prereq "remains fulfilled even when you upgrade
 * the space with another track colour" (pg. 18), which the reached-index model gives for free (a frontier
 * only advances). One-time specials (`new-worker` / `key` / `idea-token`) are consumed once; the scoring
 * specials (`route-doubling` / `bonus-star`) are recomputed from the board each scoring phase.
 */
export interface RouteSpecial {
  /** Stable id, e.g. `kyiv-star-3` — used in `consumedSpecials`, the feed and testids. */
  readonly id: string;
  readonly route: RouteId;
  /** 1-based space number on the route (pg. 8). Prereq: the wood frontier reached this space. */
  readonly space: number;
  readonly type: SpecialType;
  /** Whether reaching also needs a locomotive (pg. 19: the loco-required half of the board). */
  readonly requiresLoco: boolean;
  /** For `route-doubling`: the track colour whose frontier must reach the space (pg. 19: green). */
  readonly color?: TrackColor;
  /** For `bonus-star`: the star's printed value (pg. 19). Scoring is cumulative over reached stars. */
  readonly points?: number;
}

/** The player-board special spaces, per route, in board order (pp. 18–19 — see the art ruling above). */
export const SPECIALS: readonly RouteSpecial[] = [
  // Trans-Siberian
  { id: 'transsiberian-worker-3', route: 'transsiberian', space: 3, type: 'new-worker', requiresLoco: true },
  { id: 'transsiberian-idea-13', route: 'transsiberian', space: 13, type: 'idea-token', requiresLoco: true },
  { id: 'transsiberian-key-15', route: 'transsiberian', space: 15, type: 'key', requiresLoco: false },
  // St. Petersburg
  { id: 'stpetersburg-idea-4', route: 'stpetersburg', space: 4, type: 'idea-token', requiresLoco: true },
  { id: 'stpetersburg-idea-6', route: 'stpetersburg', space: 6, type: 'idea-token', requiresLoco: true },
  {
    id: 'stpetersburg-double-7',
    route: 'stpetersburg',
    space: 7,
    type: 'route-doubling',
    requiresLoco: true,
    color: 'green',
  },
  { id: 'stpetersburg-key-9', route: 'stpetersburg', space: 9, type: 'key', requiresLoco: false },
  // Kyiv — the cumulative bonus stars (pg. 19 example) + a new worker + the end key
  { id: 'kyiv-star-1', route: 'kyiv', space: 1, type: 'bonus-star', requiresLoco: true, points: 1 },
  { id: 'kyiv-star-2', route: 'kyiv', space: 2, type: 'bonus-star', requiresLoco: true, points: 2 },
  { id: 'kyiv-star-3', route: 'kyiv', space: 3, type: 'bonus-star', requiresLoco: true, points: 3 },
  { id: 'kyiv-star-4', route: 'kyiv', space: 4, type: 'bonus-star', requiresLoco: true, points: 4 },
  { id: 'kyiv-worker-7', route: 'kyiv', space: 7, type: 'new-worker', requiresLoco: false },
  { id: 'kyiv-key-9', route: 'kyiv', space: 9, type: 'key', requiresLoco: false },
];

/** The industry-track idea-token space (pg. 19): reached with the **wrench** at this lane index (RR5 marker). */
export const INDUSTRY_IDEA_LANE_INDEX = 10;

/** The key benefit's non-Asian options (pg. 19). `moves` = advance a wood track 1 + any track 1; `points` = +10. */
export const KEY_POINTS = 10;
