import { industryPointsAt, TWENTY_POINTS } from '../core';
import type { Locomotive, Route, RouteId, RussianRailroadsPlayer, TrackColor } from '../core';
import { bonusStarScore, routeDoubled, valuationOf } from './specials';

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
 * track at or ahead of it (beyond the player's furthest track) scores nothing.
 *
 * `doublers` (pg. 14, 20) is how many leading spaces carry a doubler tile above them (the Trans-Siberian
 * doubler count, 0 for the other routes): a doubler over space _i_ (0-based `i < doublers`) **doubles**
 * that space's points, exactly the pg. 20 example ("a doubler over space 1, so that track scores 4 instead
 * of 2").
 */
export function scoreRoute(
  route: Route,
  reach: number,
  doublers: number,
  valuation: Readonly<Record<TrackColor, number>>,
  routeDouble: boolean,
): number {
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
    if (color != null) score += valuation[color] * (s < doublers ? 2 : 1);
  }
  // Route doubling (pg. 19): the whole route scores twice once its green+loco doubling space is reached.
  return routeDouble ? score * 2 : score;
}

/**
 * Industry-track score (pg. 21): the points shown on the space the wrench is on (or the previous numbered
 * space, on a factory / numberless space). With the **second wrench** (pg. 47, RR6) both wrenches score, so
 * their two space-scores are summed. RR5's single-wrench case is `secondWrench === null` (adds nothing).
 */
export function scoreIndustry(player: RussianRailroadsPlayer): number {
  const { wrench, secondWrench } = player.industry;
  return industryPointsAt(wrench) + (secondWrench !== null ? industryPointsAt(secondWrench) : 0);
}

/**
 * The route points a player scores this phase — the sum over their three routes (pg. 20). The player's
 * doubler tiles sit above the **Trans-Siberian** route (pg. 14), so its doubler count is passed only there;
 * the valuation tile (base or revalued, pg. 46) and per-route doubling (pg. 19) apply throughout.
 */
export function scoreRoutes(player: RussianRailroadsPlayer): number {
  const valuation = valuationOf(player);
  return player.routes.reduce(
    (sum, route) =>
      sum +
      scoreRoute(
        route,
        locoReach(player.locomotives, route.id),
        route.id === 'transsiberian' ? player.doublers : 0,
        valuation,
        routeDoubled(player, route.id),
      ),
    0,
  );
}

/** One player's per-round scoring breakdown (pg. 20–21), for the cumulative total and the activity feed. */
export interface RoundScore {
  readonly playerId: string;
  readonly routes: number;
  readonly industry: number;
  /** Bonus-star + 20-point-medal points (pp. 19, 46, RR6). */
  readonly bonus: number;
  /** Points gained this round (routes + industry + bonus) — added to the player's cumulative `score`. */
  readonly gained: number;
}

/** Score one player for the round (pg. 20–21, plus pp. 19/46 specials): routes + industry + bonus. */
export function scorePlayer(player: RussianRailroadsPlayer): RoundScore {
  const routes = scoreRoutes(player);
  const industry = scoreIndustry(player);
  const bonus = bonusStarScore(player) + (player.medal20 ? TWENTY_POINTS : 0);
  return { playerId: player.id, routes, industry, bonus, gained: routes + industry + bonus };
}
