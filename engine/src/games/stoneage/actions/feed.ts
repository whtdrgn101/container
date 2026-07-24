import { RESOURCES, STARVATION_PENALTY } from '../core';
import type { Resource, StoneAgePlayer, StoneAgeState } from '../core';
import { advanceFeeder, record, seatOf, withPlayer } from '../internal';

/**
 * Feed the active player's people (rulebook pg. 7, phase 3):
 *  1. take food from the food track (the field's payoff), then
 *  2. return 1 food per people figure.
 *
 * If food falls short, the player *may* cover the remainder with resources (1 each) — `payWithResources`
 * (default true) — spending the **least valuable first** so the pricier ones survive for scoring. If they
 * won't or can't cover it in full, they lose **all** their food and take a −10-point penalty (pg. 7).
 * Then the turn passes to the next feeder, or the round rolls over (SA8).
 *
 * *(Which resources to spend is auto-chosen lowest-value-first for now; a hand-picked spend can come
 * later. Nothing here is a dice roll, so `FEED` is a normal client action, not a server-only one.)*
 */
export function feed(state: StoneAgeState, playerId: string, payWithResources = true): StoneAgeState {
  // Resolve the seat from `playerId`, not `activePlayerIndex`: `applyAction` guarantees they match, but
  // this is a public export, and reading the seat off the argument means a stray `feed(state, 'p2')`
  // throws PLAYER_NOT_FOUND / mutates the right seat rather than silently editing the active player and
  // writing a falsified `playerId` into the log.
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const produced = player.food + player.foodTrack; // step 1: food-track production (pg. 7)
  const need = player.people; // step 2: 1 food per figure

  let updated: StoneAgePlayer;
  let payload: Record<string, unknown>;
  if (produced >= need) {
    updated = { ...player, food: produced - need };
    payload = { need, paidFood: need };
  } else {
    const shortfall = need - produced;
    const totalResources = RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
    if (payWithResources && totalResources >= shortfall) {
      updated = { ...player, food: 0, resources: spendLowestFirst(player.resources, shortfall) };
      payload = { need, paidFood: produced, paidResources: shortfall };
    } else {
      // Can't (or won't) cover it: lose all food and take the starvation penalty (never below 0).
      updated = { ...player, food: 0, score: Math.max(0, player.score - STARVATION_PENALTY) };
      payload = { need, paidFood: produced, starved: shortfall, penalty: STARVATION_PENALTY };
    }
  }

  const players = withPlayer(state, seat, updated);
  const after: StoneAgeState = { ...state, players };
  return record(after, 'FEED', playerId, advanceFeeder(after), payload);
}

/** Spend `amount` resources, cheapest kind first (`RESOURCES` is in ascending scoring value). */
function spendLowestFirst(resources: Readonly<Record<Resource, number>>, amount: number): Record<Resource, number> {
  const next = { ...resources };
  let remaining = amount;
  for (const resource of RESOURCES) {
    if (remaining <= 0) break;
    const take = Math.min(next[resource], remaining);
    next[resource] -= take;
    remaining -= take;
  }
  return next;
}
