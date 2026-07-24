import type { Route, RouteId, RussianRailroadsPlayer, TrackColor } from '../core';

/**
 * The colours a player may currently build or upgrade (pg. 9: "You can build/upgrade only track types you
 * have gained access to"). **RR2 stub:** wood only — everyone has wood access from setup, and the colour
 * ladder (reach space 2/6/10/15 → green/bronze/silver/gold, pg. 8–9) is RR3. Kept as a function of the
 * player from day one so RR3 fills in the thresholds here without touching the lock or the mechanics.
 */
export function accessibleColors(_player: RussianRailroadsPlayer): readonly TrackColor[] {
  return ['wood'];
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
 * Can `colour`'s track advance one space on `route` (pg. 9)? Only if it exists, the space **ahead** is
 * still on the board (route-end stop), and that space is **empty** (tracks move only onto empty spaces and
 * cannot leapfrog or share — pg. 9).
 */
export function canAdvance(route: Route, color: TrackColor): boolean {
  const i = tileIndex(route, color);
  return i >= 0 && i + 1 < route.spaces.length && route.spaces[i + 1] === null;
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
 * Advance `colour`'s track one space forward on `route` (pg. 9) — relocate the single frontier tile from
 * its space to the next, leaving the space behind empty (empty spaces behind a track score as its colour,
 * pg. 20). Assumes the move is legal (`canAdvance` was checked); returns a new `Route`, never mutating.
 */
export function advanceTrack(route: Route, color: TrackColor): Route {
  const i = route.spaces.indexOf(color);
  const spaces = [...route.spaces];
  spaces[i] = null;
  spaces[i + 1] = color;
  return { ...route, spaces };
}
