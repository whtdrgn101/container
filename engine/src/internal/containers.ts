import { GameError } from '../core';
import type { Color, StoredContainer } from '../core';

/** The colors of a set of stored containers, ignoring their lot prices. */
export const colorsOf = (containers: readonly StoredContainer[]): Color[] => containers.map((c) => c.color);

/** True if every element of `sub` can be matched to a distinct element of `sup` (multiset ⊆). */
export function isSubMultiset(sub: readonly Color[], sup: readonly Color[]): boolean {
  const remaining = new Map<Color, number>();
  for (const color of sup) {
    remaining.set(color, (remaining.get(color) ?? 0) + 1);
  }
  for (const color of sub) {
    const available = remaining.get(color) ?? 0;
    if (available === 0) {
      return false;
    }
    remaining.set(color, available - 1);
  }
  return true;
}

/**
 * Remove `items` (matched by color AND price) from `from`, returning the remaining containers, or
 * `null` if `items` is not a sub-multiset of `from`. Used to take purchased containers out of a
 * seller's store.
 */
export function removeContainers(
  from: readonly StoredContainer[],
  items: readonly StoredContainer[],
): StoredContainer[] | null {
  const remaining = [...from];
  for (const item of items) {
    const index = remaining.findIndex((c) => c.color === item.color && c.price === item.price);
    if (index === -1) {
      return null;
    }
    remaining.splice(index, 1);
  }
  return remaining;
}

/**
 * Remove `items` (by color AND price) from a player's factory then harbor stores, returning both new
 * stores, or `null` if any item isn't found. Used to pull the containers bid in a Bank cash auction.
 */
export function removeFromBoard(
  factory: readonly StoredContainer[],
  harbor: readonly StoredContainer[],
  items: readonly StoredContainer[],
): { factoryStore: StoredContainer[]; harborStore: StoredContainer[] } | null {
  const factoryStore = [...factory];
  const harborStore = [...harbor];
  for (const item of items) {
    const fromFactory = factoryStore.findIndex((c) => c.color === item.color && c.price === item.price);
    if (fromFactory !== -1) {
      factoryStore.splice(fromFactory, 1);
      continue;
    }
    const fromHarbor = harborStore.findIndex((c) => c.color === item.color && c.price === item.price);
    if (fromHarbor === -1) {
      return null;
    }
    harborStore.splice(fromHarbor, 1);
  }
  return { factoryStore, harborStore };
}

/** Throw INVALID_LOT_PRICE if any container sits in a lot price not valid for its district. */
export function assertValidLots(containers: readonly StoredContainer[], validPrices: readonly number[]): void {
  for (const container of containers) {
    if (!validPrices.includes(container.price)) {
      throw new GameError('INVALID_LOT_PRICE', `$${container.price} is not a valid lot price here`);
    }
  }
}
