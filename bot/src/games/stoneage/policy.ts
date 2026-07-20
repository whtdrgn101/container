import {
  buildingPaymentError,
  CARD_COST,
  HUNT_THRESHOLD,
  isResourcePlace,
  legalActions,
  PLACE_RESOURCE,
  RESOURCE_THRESHOLD,
  RESOURCE_VALUE,
  RESOURCES,
} from '@game-hub/engine/stoneage';
import type { Building, PlaceId, Resource, StoneAgePlayer, StoneAgeView } from '@game-hub/engine/stoneage';
import type { Payment } from '@game-hub/engine/stoneage';

/** Average pips on a Stone Age die — used to estimate the yield of placing workers on a dice place. */
const AVG_DIE = 3.5;
/** Expected food per hunter, and expected resource per worker on a "full 4" resource place (rough). */
const FOOD_PER_HUNTER = AVG_DIE / HUNT_THRESHOLD;

/**
 * How hungry the bot is: the food it still needs to keep ~2 rounds of buffer, counting the food already
 * in hand and its food-track production. Once it's stocked, this is 0 — the bug this replaces was
 * ignoring food in hand, so the bot hunted forever and never did anything else.
 */
export function foodDeficit(player: StoneAgePlayer): number {
  const wanted = player.people * 2;
  const have = player.food + player.foodTrack * 2;
  return Math.max(0, wanted - have);
}

/**
 * Heuristic value of *using* a place, higher is better (SA12) — count-independent; `pickPlacement`
 * chooses the count. Opinions, not rules: secure food (hunt when hungry, a field for steady production),
 * gather resources, grow and tool up early, and — crucially — buy buildings/cards the bot can already
 * afford, so it actually spends and the game reaches an end. Tuned lightly; a legal bot that finishes
 * games, not an optimal one.
 */
export function placementScore(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): number {
  const hungry = foodDeficit(player) > 0;
  // Buying drains the decks and empties the stacks — the two game-end triggers — so a bot that can pay
  // prefers to spend. Food security comes first, then spending, then the gathering that funds it.
  if (place.startsWith('building')) return affordsBuilding(view, player, place) ? 8 : 0.4;
  if (place.startsWith('card')) return affordsCard(view, player, place) ? 6.5 : 0.4;
  if (place === 'hunt') return hungry ? 7 : 0.5;
  if (place === 'field') return player.foodTrack < player.people ? 5.5 : 1;
  if (isResourcePlace(place)) return 4.5 + RESOURCE_VALUE[PLACE_RESOURCE[place]] * 0.1;
  if (place === 'hut') return view.round <= 2 && player.people < 7 ? 4 : 0.4;
  if (place === 'toolMaker') return player.tools.length < 2 ? 2 : 0.3;
  return 1;
}

/** How many workers the bot wants on its chosen place — spread thin except when it needs food fast. */
function desiredCount(player: StoneAgePlayer, place: PlaceId, max: number): number {
  if (place === 'hunt') return Math.min(max, Math.max(1, Math.ceil(foodDeficit(player) / FOOD_PER_HUNTER)));
  if (isResourcePlace(place)) return Math.min(max, 3); // gather a decent haul to fund buying
  return max; // fixed-count places (their legal range is a single value)
}

/** The best `PLACE` for the active bot right now — always legal (there is always the hunt). */
export function pickPlacement(view: StoneAgeView, playerId: string): { place: PlaceId; count: number } {
  const player = view.players[view.activePlayerIndex]!;
  // Collapse the legal placements to {min,max} per place, then pick the best-scored place.
  const options = new Map<PlaceId, { min: number; max: number }>();
  for (const action of legalActions(view, playerId)) {
    if (action.type !== 'PLACE') continue;
    const cur = options.get(action.place);
    options.set(action.place, { min: Math.min(cur?.min ?? action.count, action.count), max: Math.max(cur?.max ?? action.count, action.count) });
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

/** Whether the bot can afford *some* valid payment for the top building on `place`'s stack, right now. */
function affordsBuilding(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): boolean {
  const stack = Number(place.slice('building'.length)) - 1;
  const building = view.buildings[stack]?.[0];
  return !!building && buildingPaymentFor(building, player) !== null;
}

/** Whether the bot can afford the card on `place`'s slot, right now. */
function affordsCard(view: StoneAgeView, player: StoneAgePlayer, place: PlaceId): boolean {
  const slot = Number(place.slice('card'.length)) - 1;
  return view.cardDisplay[slot] != null && cardPaymentFor(slot, player) !== null;
}

/**
 * A valid, affordable payment for a building, or `null` if the bot can't (or shouldn't) buy it. Fixed
 * buildings pay their exact cost; the flexible kinds are paid with the resources the bot has most of, so
 * it keeps a spread. Validated against the engine's own `buildingPaymentError` so it can never be illegal.
 */
export function buildingPaymentFor(building: Building, player: StoneAgePlayer): Payment | null {
  const cost = building.cost;
  const valid = (pay: Payment): Payment | null => (buildingPaymentError(building, pay, player) === null ? pay : null);

  if (cost.kind === 'fixed') return valid({ ...cost.resources });

  if (cost.kind === 'any') {
    const pay = takeCheapest(player, cost.min);
    return pay ? valid(pay) : null;
  }

  // choice: exactly `count` resources from exactly `kinds` kinds.
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

/** A valid payment for the card in `slot` (its position cost in any resources), or `null` if too poor. */
export function cardPaymentFor(slot: number, player: StoneAgePlayer): Payment | null {
  return takeCheapest(player, CARD_COST[slot]!);
}

/** Take exactly `need` resource units from a player, cheapest kinds first, or `null` if they haven't got them. */
function takeCheapest(player: StoneAgePlayer, need: number): Payment | null {
  const pay: Partial<Record<Resource, number>> = {};
  let rest = need;
  for (const r of RESOURCES) {
    if (rest <= 0) break;
    const take = Math.min(player.resources[r], rest);
    if (take > 0) {
      pay[r] = take;
      rest -= take;
    }
  }
  return rest === 0 ? pay : null;
}

/**
 * Which tools to add to a pending roll (`TAKE_GATHER`). Spends the minimal-value set of unused tools that
 * pushes the total to the next threshold multiple (+1 yield), and nothing if it can't reach it — so tools
 * are never wasted and are saved for a later gather this round.
 */
export function chooseTools(view: StoneAgeView): number[] {
  const player = view.players[view.activePlayerIndex]!;
  const pending = view.pendingGather;
  if (!pending) return [];
  const threshold = pending.place === 'hunt' ? HUNT_THRESHOLD : RESOURCE_THRESHOLD[PLACE_RESOURCE[pending.place]];
  const total = pending.dice.reduce((sum, d) => sum + d, 0);
  const remainder = total % threshold;
  if (remainder === 0) return []; // already on a multiple — a tool would be wasted
  const need = threshold - remainder;

  const avail = player.tools.map((value, index) => ({ value, index })).filter((t) => !player.toolsUsed[t.index]);
  let best: number[] | null = null;
  let bestSum = Infinity;
  for (let mask = 1; mask < 1 << avail.length; mask += 1) {
    let sum = 0;
    const indices: number[] = [];
    for (let k = 0; k < avail.length; k += 1) {
      if (mask & (1 << k)) {
        sum += avail[k]!.value;
        indices.push(avail[k]!.index);
      }
    }
    if (sum >= need && (sum < bestSum || (sum === bestSum && indices.length < best!.length))) {
      bestSum = sum;
      best = indices;
    }
  }
  return best ?? [];
}
