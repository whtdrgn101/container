import { VALUATION } from '../core';
import type { Locomotive, Route, RouteId, RussianRailroadsPlayer } from '../core';

/**
 * The scoring phase (pg. 20–21), run at the close of every round. Pure functions over a player's board —
 * no state mutation, no randomness — so the 100% gate is reachable and the same code serves every round
 * and (via the cumulative total) the winner.
 */

/**
 * A route's locomotive **reach** (pg. 20): the highest space number the player's locos on that route can
 * reach — the **sum** of their printed numbers (the pg. 20 example: a #6 and a #2 together reach space 8; a
 * lone #2 reaches space 2). A route with no locomotive has reach 0 and scores nothing. In RR2 only the
 * starting #1 exists (on the Trans-Siberian), so only that route reaches space 1; RR4 adds more locos.
 */
export function locoReach(locomotives: readonly Locomotive[], routeId: RouteId): number {
  return locomotives.filter((loco) => loco.route === routeId).reduce((sum, loco) => sum + loco.number, 0);
}

/**
 * Score one route (pg. 20). Only spaces up to the loco `reach` count. Each such space scores by the colour
 * of the **nearest track at or ahead of it** — a track scores "for the space it is on, and for any empty
 * spaces behind it" (pg. 20: empty spaces behind a track are treated as that colour). A space with no
 * track at or ahead of it (beyond the player's furthest track) scores nothing. Wood scores 0, so a
 * wood-only RR2 route scores 0 — but the rule is the full pg. 20 rule, valid for every colour (tested with
 * constructed higher-colour states).
 */
export function scoreRoute(route: Route, reach: number): number {
  const limit = Math.min(reach, route.spaces.length);
  let score = 0;
  for (let s = 0; s < limit; s += 1) {
    // The nearest track at or ahead of space `s` gives it its colour (pg. 20 "empty spaces behind").
    let color = null as (typeof route.spaces)[number] | null;
    for (let j = s; j < route.spaces.length; j += 1) {
      const here = route.spaces[j];
      if (here != null) {
        color = here;
        break;
      }
    }
    if (color != null) score += VALUATION[color];
  }
  return score;
}

/**
 * Industry-track score (pg. 21: the points shown on the space the wrench is on, or the previous space if
 * it's a factory). **RR2 stub: 0** — the wrench starts on the 0-point space and there is no way to move it
 * yet (industrialization is RR5). Kept as a function so RR5 fills in the real track without a reshape.
 */
export function scoreIndustry(_player: RussianRailroadsPlayer): number {
  return 0;
}

/** The route points a player scores this phase — the sum over their three routes (pg. 20). */
export function scoreRoutes(player: RussianRailroadsPlayer): number {
  return player.routes.reduce((sum, route) => sum + scoreRoute(route, locoReach(player.locomotives, route.id)), 0);
}

/** One player's per-round scoring breakdown (pg. 20–21), for the cumulative total and the activity feed. */
export interface RoundScore {
  readonly playerId: string;
  readonly routes: number;
  readonly industry: number;
  /** Points gained this round (routes + industry) — added to the player's cumulative `score`. */
  readonly gained: number;
}

/** Score one player for the round (pg. 20–21): routes + industry. */
export function scorePlayer(player: RussianRailroadsPlayer): RoundScore {
  const routes = scoreRoutes(player);
  const industry = scoreIndustry(player);
  return { playerId: player.id, routes, industry, gained: routes + industry };
}
