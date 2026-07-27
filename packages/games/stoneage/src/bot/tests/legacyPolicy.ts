/**
 * A **frozen copy** of the pre-rework Stone Age policy (the static greedy weight table shipped by SA12),
 * kept verbatim so the benchmark test measures the real claim: the value-based policy beats what
 * actually shipped, not a strawman. Test-only — never export this from the package, never "fix" it; if
 * the live policy changes, the benchmark keeps comparing against this same baseline.
 *
 * Frozen quirks preserved on purpose: the `round <= 2` hut gate, the `tools.length < 2` tool cap, the
 * `foodTrack < people` field cap, affordability checked against unspent resources, and "any"-cost
 * buildings paid at the *minimum* (the old `buildingPaymentFor`).
 */
import {
  ALL_PLACES,
  buildingIndex,
  buildingPaymentError,
  cardIndex,
  HUNT_THRESHOLD,
  isBuildingPlace,
  isCardPlace,
  isGatherPlace,
  isResourcePlace,
  isUsePlace,
  legalActions,
  PLACE_RESOURCE,
  RESOURCE_VALUE,
  RESOURCES,
} from '../../engine';
import type {
  Building,
  FixedPlaceId,
  PlaceId,
  Resource,
  StoneAgePlayer,
  StoneAgeState,
  StoneAgeView,
} from '../../engine';
import type { Payment } from '../../engine';
import { BotError } from '@game-hub/kernel/bot';
import { cardPaymentFor, chooseTools, foodDeficit } from '../policy';
import type { DecideFn } from '../types';

const AVG_DIE = 3.5;
const FOOD_PER_HUNTER = AVG_DIE / HUNT_THRESHOLD;

/** The old static weight table (verbatim). */
function placementScore(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): number {
  const hungry = foodDeficit(player) > 0;
  if (place.startsWith('building')) return affordsBuilding(view, player, place) ? 8 : 0.4;
  if (place.startsWith('card')) return affordsCard(view, player, place) ? 6.5 : 0.4;
  if (place === 'hunt') return hungry ? 7 : 0.5;
  if (place === 'field') return player.foodTrack < player.people ? 5.5 : 1;
  if (isResourcePlace(place)) return 4.5 + RESOURCE_VALUE[PLACE_RESOURCE[place]] * 0.1;
  if (place === 'hut') return view.round <= 2 && player.people < 7 ? 4 : 0.4;
  if (place === 'toolMaker') return player.tools.length < 2 ? 2 : 0.3;
  return 1;
}

function desiredCount(player: StoneAgePlayer, place: PlaceId, max: number): number {
  if (place === 'hunt') return Math.min(max, Math.max(1, Math.ceil(foodDeficit(player) / FOOD_PER_HUNTER)));
  if (isResourcePlace(place)) return Math.min(max, 3);
  return max;
}

function pickPlacement(view: StoneAgeView, playerId: string): { place: PlaceId; count: number } {
  const player = view.players[view.activePlayerIndex]!;
  const options = new Map<PlaceId, { min: number; max: number }>();
  // §4.6: the view redacts the undrawn deck, which legalActions never reads — safe cast for enumeration.
  for (const action of legalActions(view as unknown as StoneAgeState, playerId)) {
    if (action.type !== 'PLACE') continue;
    const cur = options.get(action.place);
    options.set(action.place, {
      min: Math.min(cur?.min ?? action.count, action.count),
      max: Math.max(cur?.max ?? action.count, action.count),
    });
  }
  let best: PlaceId | null = null;
  let bestScore = -Infinity;
  for (const place of options.keys()) {
    const score = placementScore(view, player, place);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  const { min, max } = options.get(best!)!;
  return { place: best!, count: Math.max(min, Math.min(max, desiredCount(player, best!, max))) };
}

function affordsBuilding(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): boolean {
  const stack = Number(place.slice('building'.length)) - 1;
  const building = view.buildings[stack]?.[0];
  return !!building && legacyBuildingPaymentFor(building, player) !== null;
}

function affordsCard(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): boolean {
  const slot = Number(place.slice('card'.length)) - 1;
  return view.cardDisplay[slot] != null && cardPaymentFor(slot, player) !== null;
}

/** The old building payment: richest-first, but "any" costs paid at the *minimum* (verbatim). */
export function legacyBuildingPaymentFor(building: Building, player: StoneAgePlayer): Payment | null {
  const cost = building.cost;
  const valid = (pay: Payment): Payment | null => (buildingPaymentError(building, pay, player) === null ? pay : null);

  if (cost.kind === 'fixed') return valid({ ...cost.resources });

  if (cost.kind === 'any') {
    const pay = takeRichest(player, cost.min);
    return pay ? valid(pay) : null;
  }

  const owned = RESOURCES.filter((r) => player.resources[r] > 0);
  if (owned.length < cost.kinds) return null;
  const chosen = [...owned].sort((a, b) => player.resources[b] - player.resources[a]).slice(0, cost.kinds);
  const pay: Partial<Record<Resource, number>> = {};
  for (const r of chosen) pay[r] = 1;
  let rest = cost.count - cost.kinds;
  if (rest < 0) return null;
  for (const r of chosen) {
    if (rest <= 0) break;
    const add = Math.min(player.resources[r] - 1, rest);
    if (add > 0) {
      pay[r] = (pay[r] ?? 0) + add;
      rest -= add;
    }
  }
  return rest === 0 ? valid(pay) : null;
}

function takeRichest(player: StoneAgePlayer, need: number): Payment | null {
  const pay: Partial<Record<Resource, number>> = {};
  let rest = need;
  for (const r of [...RESOURCES].reverse()) {
    if (rest <= 0) break;
    const take = Math.min(player.resources[r], rest);
    if (take > 0) {
      pay[r] = take;
      rest -= take;
    }
  }
  return rest === 0 ? pay : null;
}

const PLACE_VALUE: Record<string, number> = { forest: 3, clayPit: 4, quarry: 5, river: 6 };

function pickGather(gathers: PlaceId[], deficit: number): FixedPlaceId {
  const places = gathers as FixedPlaceId[];
  if (deficit > 0 && places.includes('hunt')) return 'hunt';
  const resources = places.filter((p) => p !== 'hunt');
  if (resources.length === 0) return 'hunt';
  return resources.reduce((best, p) => ((PLACE_VALUE[p] ?? 0) > (PLACE_VALUE[best] ?? 0) ? p : best));
}

/** The old `decide` flow over the old policy — the benchmark's opponent. */
export const legacyDecide: DecideFn = (view, playerId, options = {}) => {
  const active = view.players[view.activePlayerIndex];
  if (!active || active.id !== playerId) {
    throw new BotError(`It is not legacy seat "${playerId}"'s turn`);
  }

  if (view.phase === 'placement') return { type: 'PLACE', ...pickPlacement(view, playerId) };
  if (view.phase === 'feeding') return { type: 'FEED', payWithResources: true };
  if (view.pendingGather) return { type: 'TAKE_GATHER', toolIndices: chooseTools(view) };

  const mine = ALL_PLACES.filter((place) => view.placements[place]?.[playerId] !== undefined);
  const gathers = mine.filter(isGatherPlace);
  if (gathers.length > 0) {
    const place = pickGather(gathers, foodDeficit(active));
    if (!options.rollDice) throw new BotError(`Legacy seat "${playerId}" needs rollDice to gather`);
    return { type: 'GATHER', place, dice: options.rollDice(view.placements[place]![playerId]!) };
  }
  const use = mine.find(isUsePlace);
  if (use) return { type: 'USE', place: use };
  const buildPlace = mine.find(isBuildingPlace);
  if (buildPlace) {
    const stack = buildingIndex(buildPlace);
    const building = view.buildings[stack]?.[0];
    const pay = building ? legacyBuildingPaymentFor(building, active) : null;
    return { type: 'BUILD', stack, resources: pay ?? {} };
  }
  const cardPlace = mine.find(isCardPlace);
  if (cardPlace) {
    const slot = cardIndex(cardPlace);
    return { type: 'ACQUIRE_CARD', slot, resources: cardPaymentFor(slot, active) ?? {} };
  }
  throw new BotError(`Legacy seat "${playerId}" has no worker to resolve`);
};
