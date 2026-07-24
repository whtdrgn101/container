import { routeColors, TRACK_COLORS, UNLOCK_SPACE } from '../core';
import type { Route, RouteId, RussianRailroadsPlayer, TrackColor } from '../core';

/**
 * The colours a player may currently build or upgrade (pg. 8–9: "You can build/upgrade only track types you
 * have gained access to"). Wood is always available; the higher colours unlock when the player's **wood**
 * track **reaches or passes** the Trans-Siberian threshold space (`UNLOCK_SPACE`: green 2 / bronze 6 /
 * silver 10 / gold 15 — pg. 8–9). Access is global (any route that supports the colour) and monotonic (the
 * wood track only advances). The wood tile is the frontier of its colour, so its 1-based space is
 * `indexOf('wood') + 1` on the Trans-Siberian; a route with no wood tile (never at setup) contributes
 * nothing.
 */
export function accessibleColors(player: RussianRailroadsPlayer): readonly TrackColor[] {
  const transsib = player.routes.find((r) => r.id === 'transsiberian');
  const woodSpace = transsib ? transsib.spaces.indexOf('wood') + 1 : 0; // 1-based; 0 when no wood tile
  return TRACK_COLORS.filter(
    (color) => color === 'wood' || woodSpace >= UNLOCK_SPACE[color as Exclude<TrackColor, 'wood'>],
  );
}

/**
 * The index of `colour`'s frontier track on `route`, or `-1` if the player has no track of that colour on
 * it. There is at most one track of each colour per route (pg. 8: "one next to each route"), so a plain
 * `indexOf` finds it.
 */
export function tileIndex(route: Route, color: TrackColor): number {
  return route.spaces.indexOf(color);
}

/**
 * Can `colour`'s track advance one space on `route` (pg. 9)? The colour must be one the route accepts
 * (pg. 9: "Not all routes use all track colors"). Then:
 *
 *  - **A colour not yet on the route** enters at **space 1** (index 0) as its first move (pg. 9 example:
 *    "you place your green track on space 1 of a route") — legal only if space 1 is empty.
 *  - **An existing tile** relocates one space forward — legal only if the space **ahead** is on the board
 *    (route-end stop) and **empty** (no leapfrog / no sharing, pg. 9).
 *
 * Tracks are **not** kept in a fixed colour order along a route (pg. 9 shows green behind bronze; pg. 20
 * shows bronze behind green) — the only positional rule is onto-empty-only. The colour *tier* order is
 * enforced upstream by `accessibleColors` (the ascending unlock thresholds).
 */
export function canAdvance(route: Route, color: TrackColor): boolean {
  if (!routeColors(route.id).includes(color)) return false;
  const i = tileIndex(route, color);
  if (i < 0) return route.spaces[0] === null; // a new colour enters at space 1
  return i + 1 < route.spaces.length && route.spaces[i + 1] === null;
}

/** One legal single track step under a lock: which route, which colour. */
export interface TrackStep {
  readonly route: RouteId;
  readonly color: TrackColor;
}

/**
 * Every legal single track step across a player's routes for a lock constrained to `colours` — the exact,
 * small enumeration the pending-lock design buys (one step at a time, never every N-step distribution).
 * Drives `legalActions`, the auto-release check, and the UI's clickable routes.
 */
export function legalSteps(routes: readonly Route[], colors: readonly TrackColor[]): TrackStep[] {
  const steps: TrackStep[] = [];
  for (const route of routes) {
    for (const color of colors) {
      if (canAdvance(route, color)) steps.push({ route: route.id, color });
    }
  }
  return steps;
}

/**
 * Advance `colour`'s track one space forward on `route` (pg. 9). A colour **not yet on the route** enters
 * at space 1 (index 0); an **existing** tile relocates from its space to the next, leaving the space behind
 * empty (empty spaces behind a track score as its colour, pg. 20). Assumes the move is legal (`canAdvance`
 * was checked); returns a new `Route`, never mutating.
 */
export function advanceTrack(route: Route, color: TrackColor): Route {
  const i = route.spaces.indexOf(color);
  const spaces = [...route.spaces];
  if (i < 0) {
    spaces[0] = color; // the colour enters at space 1
  } else {
    spaces[i] = null;
    spaces[i + 1] = color;
  }
  return { ...route, spaces };
}
