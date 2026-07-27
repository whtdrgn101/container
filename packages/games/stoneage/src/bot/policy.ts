import {
  buildingPaymentError,
  CARD_COST,
  CIV_CARD_DECK,
  HUNT_THRESHOLD,
  isBuildingPlace,
  isCardPlace,
  isResourcePlace,
  legalActions,
  MAX_FOOD_TRACK,
  MAX_PEOPLE,
  PLACE_RESOURCE,
  RESOURCE_THRESHOLD,
  RESOURCE_VALUE,
  RESOURCES,
} from '../engine';
import type {
  Building,
  CardScoring,
  CivCard,
  PlaceId,
  Resource,
  StoneAgePlayer,
  StoneAgeState,
  StoneAgeView,
} from '../engine';
import type { Payment } from '../engine';

/** Average pips on a Stone Age die — used to estimate the yield of placing workers on a dice place. */
const AVG_DIE = 3.5;
/** Expected food per hunter, and expected resource per worker on a "full 4" resource place (rough). */
const FOOD_PER_HUNTER = AVG_DIE / HUNT_THRESHOLD;

/**
 * The tunable opinions, in one place (SA12 rework). Every number is "about how many end-game points is
 * this worth" — the evaluator prices each placement in marginal points, so the compounding engines
 * (population, agriculture, tools) are valued by their remaining horizon instead of hard round gates.
 * These are opinions, not rules; retune freely (the benchmark test is the referee).
 */
export const WEIGHTS = {
  /** Points one worker generates per round it exists (gathering → buildings, roughly). */
  workerRound: 1.2,
  /** Points-cost of feeding one person for one round (food it must produce or forgo). */
  feedPerRound: 0.4,
  /** Value of one food in hand when the larder is fine / when it closes a real deficit. */
  foodValue: 0.35,
  starvingFoodValue: 1.0,
  /** Points-per-round of one food-track step / of one point of tool value. */
  fieldPerRound: 0.5,
  toolPerRound: 0.35,
  /** A banked resource converts to points at this fraction of face value (buildings pay face; leftovers pay 1). */
  resourceWorth: 0.4,
  /** Beyond this many banked resources, further ones are mostly leftovers. */
  stockpileSoftCap: 8,
  stockpiledWorth: 0.25,
  /** Buying a building this round beats the same points later (frees the slot, banks before the end). */
  buildTempo: 0.5,
  /** Opportunity cost per worker committed to a place (what an average alternative would have earned). */
  workerShadow: 0.8,
  /** Score for a purchase slot the bot can't pay for after its earlier commitments this round. */
  unaffordable: 0.2,
  /**
   * Extra points per gathered unit of a resource that is the *binding constraint* on a nearly-buyable
   * building (a revealed fixed cost within `nearlyBuyableShortfall` units of affordable). Every
   * resource's expected per-worker value is otherwise identical (RESOURCE_VALUE equals
   * RESOURCE_THRESHOLD, so yield × value cancels), which once left a two-bot game deadlocked: both
   * revealed buildings needed stone, the tie-broken argmax never picked the quarry, and with growth
   * capped nothing could end the game. Scoped to nearly-buyable so early-game gathering doesn't
   * outbid the hut; the scarcity tie-breaker below handles the general drift.
   */
  neededResource: 1.0,
  nearlyBuyableShortfall: 2,
  /** Tiny per-unit-held penalty on a resource place — breaks exact value ties toward what's scarce. */
  scarcityTiebreak: 0.02,
  /** Extra value of taking a slot an opponent still could — single-occupancy places compound for whoever holds them. */
  denial: { hut: 1.5, field: 1.0, toolMaker: 0.75, purchase: 0.5 },
  /** How fast a typical player grows each stat per round — projects the sand multipliers' final values. */
  growthPerRound: { foodTrack: 0.35, toolValue: 0.4, buildings: 0.4, people: 0.2 },
} as const;

/** Look up a civilization card (the bot's own held cards are stored as ids). */
const CARD_BY_ID = new Map<string, CivCard>(CIV_CARD_DECK.map((card) => [card.id, card]));

/** How many of each sand multiplier the player holds, and which green symbols — drives card + engine values. */
export function heldScoring(player: StoneAgePlayer): {
  symbols: ReadonlySet<string>;
  farmer: number;
  toolMaker: number;
  builder: number;
  shaman: number;
} {
  const symbols = new Set<string>();
  const counts = { farmer: 0, toolMaker: 0, builder: 0, shaman: 0 };
  for (const id of player.civCards) {
    const scoring = CARD_BY_ID.get(id)?.scoring;
    if (!scoring) continue;
    if (scoring.kind === 'green') symbols.add(scoring.symbol);
    else counts[scoring.kind] += 1;
  }
  return { symbols, ...counts };
}

/**
 * How many rounds this game likely has left — the horizon all the compounding math discounts against.
 * Both real end triggers bound it (`feeding.ts`): a building stack empties (each loses ≤1 tile/round, so
 * the shallowest stack is a hard bound) or the card deck can't refill the display (it drains only by
 * cards actually bought, so divide by the table's plausible buy rate).
 */
export function remainingRounds(view: StoneAgeView): number {
  const byBuildings = Math.min(...view.buildings.map((stack) => stack.length));
  const buysPerRound = Math.min(view.players.length, 2.5);
  const byCards = Math.ceil(view.cardDeckCount / buysPerRound);
  return Math.max(1, Math.min(byBuildings, byCards, 12));
}

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

/** Points one banked unit of `resource` converts at — face value via buildings, 1 as a leftover. */
function resourceWorth(resource: Resource, player: StoneAgePlayer, roundsLeft: number): number {
  if (roundsLeft < 2) return 1; // no time to spend it — it scores as a leftover
  const banked = RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
  const fraction = banked >= WEIGHTS.stockpileSoftCap ? WEIGHTS.stockpiledWorth : WEIGHTS.resourceWorth;
  return fraction * RESOURCE_VALUE[resource];
}

/**
 * The player as they'll stand *after* paying for the purchase slots they already occupy this round —
 * the phantom-affordability fix. The old bot checked every building/card slot against its full, unspent
 * stock, so affording *one* building made *every* slot look buyable and it stranded workers on slots it
 * then declined. Commitments are priced in placement (board) order, matching how cheap resources get
 * consumed first by card tolls.
 */
export function residualAfterCommitments(view: StoneAgeView, player: StoneAgePlayer): StoneAgePlayer {
  let residual = player;
  const spend = (payment: Payment | null) => {
    if (!payment) return;
    const resources = { ...residual.resources };
    for (const r of RESOURCES) resources[r] = Math.max(0, resources[r] - (payment[r] ?? 0));
    residual = { ...residual, resources };
  };
  view.buildings.forEach((stack, i) => {
    if (view.placements[`building${i + 1}` as PlaceId]?.[player.id] === undefined) return;
    const building = stack[0];
    if (building) spend(buildingPaymentFor(building, residual));
  });
  for (let slot = 0; slot < view.cardDisplay.length; slot += 1) {
    if (view.placements[`card${slot + 1}` as PlaceId]?.[player.id] === undefined) continue;
    if (view.cardDisplay[slot]) spend(cardPaymentFor(slot, residual));
  }
  return residual;
}

/**
 * Per-resource shortfall vs revealed fixed-cost buildings that are *nearly buyable* (missing at most
 * `nearlyBuyableShortfall` units in total) — the binding constraint gathering should chase.
 */
function purchaseShortfall(view: StoneAgeView, player: StoneAgePlayer): Record<Resource, number> {
  const short: Record<Resource, number> = { wood: 0, brick: 0, stone: 0, gold: 0 };
  for (const stack of view.buildings) {
    const cost = stack[0]?.cost;
    if (cost?.kind !== 'fixed') continue;
    const missing: Partial<Record<Resource, number>> = {};
    let total = 0;
    for (const r of RESOURCES) {
      const m = Math.max(0, (cost.resources[r] ?? 0) - player.resources[r]);
      missing[r] = m;
      total += m;
    }
    if (total === 0 || total > WEIGHTS.nearlyBuyableShortfall) continue;
    for (const r of RESOURCES) short[r] += missing[r]!;
  }
  return short;
}

/** Whether any opponent still has people in hand to place — when true, taking a slot also denies it. */
function opponentsCanFollow(view: StoneAgeView, playerId: string): boolean {
  return view.players.some((p) => {
    if (p.id === playerId) return false;
    let placed = 0;
    for (const byPlayer of Object.values(view.placements)) placed += byPlayer[p.id] ?? 0;
    return p.people - placed > 0;
  });
}

/** The immediate-effect part of a card's value, in points. */
function effectValue(card: CivCard, player: StoneAgePlayer, roundsLeft: number): number {
  const effect = card.effect;
  switch (effect.kind) {
    case 'resource':
      return effect.amount * resourceWorth(effect.resource, player, roundsLeft);
    case 'food':
      return effect.amount * WEIGHTS.foodValue;
    case 'foodTrack': {
      const gained = Math.min(MAX_FOOD_TRACK, player.foodTrack + effect.amount) - player.foodTrack;
      return gained * roundsLeft * WEIGHTS.fieldPerRound;
    }
    case 'tool':
      return roundsLeft * WEIGHTS.toolPerRound + heldScoring(player).toolMaker;
    case 'points':
      return effect.amount;
    default: // 'none'
      return 0;
  }
}

/**
 * The end-game part of a card's value, in points. Green cards score distinct symbols *squared*, so a
 * *new* symbol's marginal value is `2s + 1` (s → s+1 distinct) and a duplicate's is 0. A sand multiplier
 * is worth its stat's projected final value (current + typical growth over the remaining rounds).
 */
function scoringValue(scoring: CardScoring, player: StoneAgePlayer, roundsLeft: number): number {
  const grow = WEIGHTS.growthPerRound;
  switch (scoring.kind) {
    case 'green': {
      const symbols = heldScoring(player).symbols;
      return symbols.has(scoring.symbol) ? 0 : 2 * symbols.size + 1;
    }
    case 'farmer':
      return Math.min(MAX_FOOD_TRACK, player.foodTrack + grow.foodTrack * roundsLeft);
    case 'toolMaker':
      return Math.min(12, player.tools.reduce((sum, v) => sum + v, 0) + grow.toolValue * roundsLeft); // 3 slots × max 4
    case 'builder':
      return player.buildings + grow.buildings * roundsLeft;
    default: // 'shaman'
      return Math.min(MAX_PEOPLE, player.people + grow.people * roundsLeft);
  }
}

/** The combined face value of a payment (a building's score is exactly this). */
function paymentValue(payment: Payment): number {
  return RESOURCES.reduce((sum, r) => sum + (payment[r] ?? 0) * RESOURCE_VALUE[r], 0);
}

/** The conversion cost of a payment: what those banked resources were worth left unspent. */
function paymentWorth(payment: Payment, player: StoneAgePlayer, roundsLeft: number): number {
  return RESOURCES.reduce((sum, r) => sum + (payment[r] ?? 0) * resourceWorth(r, player, roundsLeft), 0);
}

/**
 * Marginal end-game points of placing `count` people on `place` right now (SA12 rework). `residual` is
 * the player net of this round's earlier purchase commitments — affordability is always judged there.
 * Callers subtract the worker opportunity cost (`count × workerShadow`); this returns gross value.
 */
export function placementValue(
  view: StoneAgeView,
  player: StoneAgePlayer,
  place: PlaceId,
  count: number,
  roundsLeft: number,
  residual: StoneAgePlayer = player,
): number {
  const held = heldScoring(player);
  const contested = opponentsCanFollow(view, player.id);

  if (isBuildingPlace(place)) {
    const building = view.buildings[Number(place.slice('building'.length)) - 1]?.[0];
    const pay = building ? buildingPaymentFor(building, residual) : null;
    if (!pay) return WEIGHTS.unaffordable;
    return (
      paymentValue(pay) -
      paymentWorth(pay, player, roundsLeft) +
      held.builder +
      WEIGHTS.buildTempo +
      (contested ? WEIGHTS.denial.purchase : 0)
    );
  }

  if (isCardPlace(place)) {
    const slot = Number(place.slice('card'.length)) - 1;
    const card = view.cardDisplay[slot];
    const pay = card ? cardPaymentFor(slot, residual) : null;
    if (!card || !pay) return WEIGHTS.unaffordable;
    return (
      effectValue(card, player, roundsLeft) +
      scoringValue(card.scoring, player, roundsLeft) -
      paymentWorth(pay, player, roundsLeft) +
      (contested ? WEIGHTS.denial.purchase : 0)
    );
  }

  if (place === 'hunt') {
    const foodGain = count * FOOD_PER_HUNTER;
    const deficit = foodDeficit(player);
    // Food that closes an actual this-round shortfall is dearest — it amortizes the −10 starvation hit.
    const urgent = Math.max(0, player.people - player.food - player.foodTrack);
    const covered = Math.min(foodGain, deficit);
    return (
      covered * WEIGHTS.starvingFoodValue + (foodGain - covered) * WEIGHTS.foodValue + Math.min(foodGain, urgent) * 1.5
    );
  }

  if (isResourcePlace(place)) {
    const resource = PLACE_RESOURCE[place];
    const gain = count * (AVG_DIE / RESOURCE_THRESHOLD[resource]);
    const needed = Math.min(gain, purchaseShortfall(view, player)[resource]);
    const scarcity = Math.min(player.resources[resource], 12) * WEIGHTS.scarcityTiebreak;
    return gain * resourceWorth(resource, player, roundsLeft) + needed * WEIGHTS.neededResource - scarcity;
  }

  if (place === 'field') {
    // At the top of the printed track (pg. 2) a field use gains nothing — the spot is only a block.
    if (player.foodTrack >= MAX_FOOD_TRACK) return contested ? WEIGHTS.denial.field : 0.1;
    const base = roundsLeft * WEIGHTS.fieldPerRound + held.farmer;
    // Producing past the people count only banks surplus food — still worth something, not the full rate.
    const value = player.foodTrack >= player.people ? base * 0.5 : base;
    return value + (contested ? WEIGHTS.denial.field : 0);
  }

  if (place === 'toolMaker') {
    const maxed = player.tools.length === 3 && player.tools.every((v) => v >= 4);
    if (maxed) return 0.1; // a 13th tool is a no-op
    return roundsLeft * WEIGHTS.toolPerRound + held.toolMaker + (contested ? WEIGHTS.denial.toolMaker : 0);
  }

  // hut: one more person for every remaining round — the compounding engine. Value decays naturally as
  // the horizon shrinks (this replaces the old `round <= 2` gate that froze the bot's population).
  // At the population cap (pg. 2 — the general supply is empty) the spot is only a block.
  if (player.people >= MAX_PEOPLE) return contested ? WEIGHTS.denial.hut : 0.1;
  const netPerRound = WEIGHTS.workerRound - WEIGHTS.feedPerRound;
  return Math.max(0, roundsLeft - 1) * netPerRound + held.shaman + (contested ? WEIGHTS.denial.hut : 0);
}

/**
 * The best `PLACE` for the active bot right now — always legal (there is always the hunt). Argmax over
 * every legal `(place, count)` pair of marginal value minus the worker opportunity cost, so how *many*
 * workers to commit falls out of the same pricing as *where* (no separate desired-count rule).
 */
export function pickPlacement(view: StoneAgeView, playerId: string): { place: PlaceId; count: number } {
  const player = view.players[view.activePlayerIndex]!;
  const roundsLeft = remainingRounds(view);
  const residual = residualAfterCommitments(view, player);

  let best: { place: PlaceId; count: number } | null = null;
  let bestScore = -Infinity;
  // legalActions enumerates moves off public state and never reads the redacted deck (§4.6) — safe cast,
  // the same shape SP's bot uses to drive engine enumeration off a redacted view.
  for (const action of legalActions(view as unknown as StoneAgeState, playerId)) {
    if (action.type !== 'PLACE') continue;
    const score =
      placementValue(view, player, action.place, action.count, roundsLeft, residual) -
      action.count * WEIGHTS.workerShadow;
    if (score > bestScore) {
      bestScore = score;
      best = { place: action.place, count: action.count };
    }
  }
  return best!;
}

/** Whether the bot can afford *some* valid payment for the top building on `place`'s stack, right now. */

/**
 * A valid, affordable payment for a building, or `null` if the bot can't (or shouldn't) buy it. Fixed
 * buildings pay their exact cost; the flexible kinds are paid with the resources the bot has most of, so
 * it keeps a spread. Validated against the engine's own `buildingPaymentError` so it can never be illegal.
 *
 * ⚠️ A building's score **is** the value of what you pay (`build.ts` scores `paymentValue(payment)`),
 * while an unspent resource is worth only 1 point at game end. So a free-choice ("any") building should
 * be paid with the bot's *most* valuable resources, not its cheapest — spending gold (6) beats spending
 * wood (3). This is the opposite of a card, whose cost is a pure toll that awards no points and so is
 * rightly paid cheapest-first (`cardPaymentFor`). Same affordability either way (both spend the same
 * total count), so richest-first never turns an affordable building unaffordable.
 *
 * An "any 1–7" building is also paid to the **max** the bot can: every unit paid converts at face value
 * (3–6 points) versus 1 as a leftover, so a big dump into an open-cost building is the best conversion
 * in the game. (The old min-payment made these buildings score 3–6 points instead of 20+.)
 */
export function buildingPaymentFor(building: Building, player: StoneAgePlayer): Payment | null {
  const cost = building.cost;
  const valid = (pay: Payment): Payment | null => (buildingPaymentError(building, pay, player) === null ? pay : null);

  if (cost.kind === 'fixed') return valid({ ...cost.resources });

  if (cost.kind === 'any') {
    const banked = RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
    const spend = Math.min(cost.max, banked);
    if (spend < cost.min) return null;
    const pay = takeRichest(player, spend);
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
  return takeInOrder(player, need, RESOURCES);
}

/** As `takeCheapest`, but spends the *most* valuable kinds first — for building payments (see above). */
function takeRichest(player: StoneAgePlayer, need: number): Payment | null {
  return takeInOrder(player, need, [...RESOURCES].reverse());
}

/** Take exactly `need` units, drawing kinds in `order`, or `null` if the player hasn't got that many. */
function takeInOrder(player: StoneAgePlayer, need: number, order: readonly Resource[]): Payment | null {
  const pay: Partial<Record<Resource, number>> = {};
  let rest = need;
  for (const r of order) {
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
