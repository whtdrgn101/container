import { shuffle } from '@game-hub/kernel';
import { BUILDING_DECK, BUILDING_PLACES, BUILDING_STACK_SIZE, RESOURCE_VALUE, RESOURCES } from '../core';
import type { Building, BuildingPlaceId, PlaceId, Resource, StoneAgePlayer } from '../core';

/** A resource payment as `resource → count`. */
export type Payment = Readonly<Partial<Record<Resource, number>>>;

/** Type guard: is this place one of the building slots? */
export function isBuildingPlace(place: PlaceId): place is BuildingPlaceId {
  return (BUILDING_PLACES as readonly PlaceId[]).includes(place);
}

/** The stack index (0-based) behind a building slot id — `building1` → 0. */
export function buildingIndex(place: BuildingPlaceId): number {
  return BUILDING_PLACES.indexOf(place);
}

/** The building slot id for a stack index — 0 → `building1`. */
export function buildingPlaceId(index: number): BuildingPlaceId {
  return BUILDING_PLACES[index]!;
}

/**
 * Shuffle the building deck (Fisher–Yates on the injected rng) and deal `playerCount` stacks of 7
 * (pg. 3, setup step 9). Without an rng the deck order is kept — deterministic, for tests.
 */
export function dealBuildings(playerCount: number, rng?: () => number): Building[][] {
  const deck = shuffle(BUILDING_DECK, rng);
  const stacks: Building[][] = [];
  for (let s = 0; s < playerCount; s += 1) {
    stacks.push(deck.slice(s * BUILDING_STACK_SIZE, s * BUILDING_STACK_SIZE + BUILDING_STACK_SIZE));
  }
  return stacks;
}

/** Total number of resources in a payment. */
export function totalPaid(payment: Payment): number {
  return RESOURCES.reduce((sum, r) => sum + (payment[r] ?? 0), 0);
}

/** The scoring value of a payment (pg. 7: a building scores the combined value of what you pay). */
export function paymentValue(payment: Payment): number {
  return RESOURCES.reduce((sum, r) => sum + (payment[r] ?? 0) * RESOURCE_VALUE[r], 0);
}

/**
 * Why `payment` can't buy `building` for `player`, or `null` if it's a legal purchase (pg. 7). Checks
 * the player owns the resources, every count is a non-negative whole number, and the payment fits the
 * tile's cost rule (exact for `fixed`; `count`-from-`kinds` for `choice`; a `min`..`max` total for `any`).
 */
export function buildingPaymentError(building: Building, payment: Payment, player: StoneAgePlayer): string | null {
  for (const r of RESOURCES) {
    const n = payment[r] ?? 0;
    if (!Number.isInteger(n) || n < 0) return `Payment of ${r} must be a whole number`;
    if (n > player.resources[r]) return `Not enough ${r} to pay for this building`;
  }

  const total = totalPaid(payment);
  const kinds = RESOURCES.filter((r) => (payment[r] ?? 0) > 0).length;
  const { cost } = building;
  switch (cost.kind) {
    case 'fixed':
      for (const r of RESOURCES) {
        if ((payment[r] ?? 0) !== (cost.resources[r] ?? 0))
          return 'This building must be paid with its exact resources';
      }
      return null;
    case 'choice':
      if (total !== cost.count) return `This building needs exactly ${cost.count} resources`;
      if (kinds !== cost.kinds) return `This building needs exactly ${cost.kinds} different kinds`;
      return null;
    default: // 'any'
      if (total < cost.min || total > cost.max) return `This building takes ${cost.min}–${cost.max} resources`;
      return null;
  }
}
