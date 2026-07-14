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

/** Throw INVALID_LOT_PRICE if any container sits in a lot price not valid for its district. */
export function assertValidLots(containers: readonly StoredContainer[], validPrices: readonly number[]): void {
  for (const container of containers) {
    if (!validPrices.includes(container.price)) {
      throw new GameError('INVALID_LOT_PRICE', `$${container.price} is not a valid lot price here`);
    }
  }
}
