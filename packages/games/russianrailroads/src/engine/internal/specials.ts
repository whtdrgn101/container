import { INDUSTRY_IDEA_LANE_INDEX, SPECIALS, VALUATION, VALUATION_REVALUED } from '../core';
import type {
  Locomotive,
  Route,
  RouteId,
  RouteSpecial,
  RussianRailroadsPlayer,
  RussianRailroadsState,
  TrackColor,
} from '../core';
import { withPlayer } from './players';

/**
 * Player-board special-space helpers (pp. 18–19, RR6). Pure functions over a player's board — the reached
 * prerequisites, the one-time firing (`settleSpecials`), and the persistent scoring specials (bonus stars,
 * route doubling). Kept independent of `scoring.ts` (which imports *these*) so there is no import cycle; the
 * tiny loco-reach computation is inlined.
 */

/** The furthest (0-based) space index any track has reached on `route`, or −1 if the route is empty. */
export function frontierIndex(route: Route): number {
  for (let i = route.spaces.length - 1; i >= 0; i -= 1) {
    if (route.spaces[i] != null) return i;
  }
  return -1;
}

/** A route's locomotive reach (pg. 20): the sum of its locos' printed numbers (0 with no loco there). */
function reachOf(locomotives: readonly Locomotive[], routeId: RouteId): number {
  return locomotives.filter((l) => l.route === routeId).reduce((sum, l) => sum + l.number, 0);
}

/**
 * Is `special`'s prerequisite met for `player` right now (pg. 18–19)? The wood-track prereq is "a track has
 * reached the space" (frontier ≥ the space, which persists through colour upgrades — pg. 18); `route-doubling`
 * additionally needs the **green** track to have reached it (pg. 19); `requiresLoco` needs the route's loco
 * reach ≥ the space. All three conditions are monotonic, so a met prereq stays met.
 */
export function specialMet(player: RussianRailroadsPlayer, special: RouteSpecial): boolean {
  const route = player.routes.find((r) => r.id === special.route);
  if (!route) return false;
  const index = special.space - 1;
  const reached = special.color
    ? route.spaces.indexOf(special.color) >= index // route-doubling: the green frontier must reach it
    : frontierIndex(route) >= index; // wood-track prereq: any track reached it
  if (!reached) return false;
  if (special.requiresLoco && reachOf(player.locomotives, special.route) < special.space) return false;
  return true;
}

/** The specials a player has met but not yet consumed, in board order (pp. 18–19) — the firing queue. */
function unfiredSpecials(player: RussianRailroadsPlayer): RouteSpecial[] {
  return SPECIALS.filter(
    (s) =>
      (s.type === 'new-worker' || s.type === 'key' || s.type === 'idea-token') &&
      !player.consumedSpecials.includes(s.id) &&
      specialMet(player, s),
  );
}

/**
 * Settle a player's newly-reached one-time specials (pp. 18–19, RR6) after a board change (a track move or a
 * loco placement can newly satisfy a prereq). Fires every **choiceless** `new-worker` immediately (+1
 * permanent worker), then, at the first **choiceful** special (`key` / `idea-token`), consumes it and sets
 * the matching pending lock. Returns the updated roster, the lock changes to fold into `record()`, and
 * whether a choice is now **held** (so the caller keeps the turn instead of passing it).
 */
/** The industry-track idea space (pg. 19): due when the wrench has reached its lane index, once, unconsumed. */
const INDUSTRY_IDEA_ID = 'industry-idea';
function industryIdeaDue(player: RussianRailroadsPlayer): boolean {
  return player.industry.wrench >= INDUSTRY_IDEA_LANE_INDEX && !player.consumedSpecials.includes(INDUSTRY_IDEA_ID);
}

export function settleSpecials(
  state: RussianRailroadsState,
  seat: number,
): { players: readonly RussianRailroadsPlayer[]; changes: Partial<RussianRailroadsState>; held: boolean } {
  let player = state.players[seat]!;
  // Fire choiceless new-worker specials one at a time (each +1 worker), until none remain or a choice is due.
  for (;;) {
    const queue = unfiredSpecials(player);
    if (queue.length === 0) break;
    const next = queue[0]!;
    if (next.type === 'new-worker') {
      player = {
        ...player,
        workersTotal: player.workersTotal + 1,
        workersAvailable: player.workersAvailable + 1,
        consumedSpecials: [...player.consumedSpecials, next.id],
      };
      continue;
    }
    // A choiceful route special (key / idea-token): consume it and open its lock, holding the turn.
    const consumed = { ...player, consumedSpecials: [...player.consumedSpecials, next.id] };
    if (next.type === 'key') {
      // Receiving a key bumps the lifetime count (an end-bonus card scores it, pg. 47) and owes one choice.
      // Specials fire one at a time and only after any prior key was resolved, so `pendingKey` is always
      // clear here — a single new key.
      const withKey = { ...consumed, keysReceived: consumed.keysReceived + 1 };
      return { players: withPlayer(state, seat, withKey), changes: { pendingKey: { remaining: 1 } }, held: true };
    }
    return { players: withPlayer(state, seat, consumed), changes: { pendingIdeaToken: { spaceId: next.id } }, held: true };
  }
  // No route special is due: the industry-track idea space (pg. 19) may still owe an idea-token choice.
  if (industryIdeaDue(player)) {
    const consumed = { ...player, consumedSpecials: [...player.consumedSpecials, INDUSTRY_IDEA_ID] };
    return {
      players: withPlayer(state, seat, consumed),
      changes: { pendingIdeaToken: { spaceId: INDUSTRY_IDEA_ID } },
      held: true,
    };
  }
  return { players: withPlayer(state, seat, player), changes: {}, held: false };
}

/** The valuation tile a player scores by (pg. 20, 46): the better one once the revaluation token is used. */
export function valuationOf(player: RussianRailroadsPlayer): Readonly<Record<TrackColor, number>> {
  return player.revalued ? VALUATION_REVALUED : VALUATION;
}

/** Is `routeId` **doubled** for `player` (pg. 19): a met route-doubling special sits on it (green + loco). */
export function routeDoubled(player: RussianRailroadsPlayer, routeId: RouteId): boolean {
  return SPECIALS.some((s) => s.type === 'route-doubling' && s.route === routeId && specialMet(player, s));
}

/**
 * The cumulative **bonus-star** points a player scores this phase (pg. 19): the sum of the star values on
 * every bonus-star special whose prereq (wood track + loco reach) is met. "Cumulative" is the sum over all
 * reached stars — the pg. 19 example: a track on Kyiv space 3 with a #3 loco scores 1+2+3 = 6.
 */
export function bonusStarScore(player: RussianRailroadsPlayer): number {
  // Every `bonus-star` special carries `points` (see SPECIALS), so the sum reads it directly.
  return SPECIALS.filter((s) => s.type === 'bonus-star' && specialMet(player, s)).reduce((sum, s) => sum + s.points!, 0);
}
