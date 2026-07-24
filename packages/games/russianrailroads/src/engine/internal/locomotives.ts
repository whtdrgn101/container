import { GameError, LOCO_CAPACITY, LOCO_STACK_NUMBERS, LOCO_TEN } from '../core';
import type { Locomotive, LocomotiveSupply, RouteId, RussianRailroadsPlayer } from '../core';

/**
 * The minimal player shape the board helpers read — just the routes and locomotives. Both the engine's
 * `RussianRailroadsPlayer` and the UI's redacted `PlayerView` satisfy it (locomotives are public), so the
 * client can reuse `locoResolutions` / `locosOnRoute` without a cast.
 */
type LocoBoard = Pick<RussianRailroadsPlayer, 'routes' | 'locomotives'>;

/**
 * The locomotive/factory supply model + placement helpers (pg. 4, 10–12). Pure functions over the supply
 * and a player's board — no mutation, no randomness — so the 100% gate is reachable and the same code
 * serves the engine, the module and the bot (RR10).
 */

/**
 * The initial locomotive/factory supply (pg. 4, 10–12): the #2–#9 stacks each with `count` locomotives
 * (pg. 12 — one per player), the two #10 stacks each with `count` (pg. 4), and no returned factories yet.
 */
export function initialLocoSupply(count: number): LocomotiveSupply {
  const stacks: Record<number, number> = {};
  for (const n of LOCO_STACK_NUMBERS) stacks[n] = count;
  return { stacks, tens: [count, count], returnedFactories: {} };
}

/**
 * The lowest-numbered locomotive currently available to acquire (pg. 10, 12), or `null` if the supply is
 * exhausted. You take from the lowest non-empty #2–#9 stack; the two #10 stacks open **only once every
 * #2–#9 stack is empty** (pg. 10 — equivalently, once #9 is empty, since lower stacks empty first).
 */
export function lowestAvailableLoco(supply: LocomotiveSupply): number | null {
  for (const n of LOCO_STACK_NUMBERS) {
    if ((supply.stacks[n] ?? 0) > 0) return n;
  }
  // Every #2–#9 stack is empty: both #10 stacks are now available (pg. 10).
  if (supply.tens[0] > 0 || supply.tens[1] > 0) return LOCO_TEN;
  return null;
}

/**
 * Take the lowest-numbered available locomotive from the supply (pg. 10, 12). Returns its printed number
 * and the drawn-down supply; throws `LOCO_SUPPLY_EMPTY` when nothing is left. When drawing a #10 it comes
 * from whichever #10 stack still has tiles (the two differ only in their *factory* action — RR5).
 */
export function takeLowestLoco(supply: LocomotiveSupply): {
  readonly number: number;
  readonly supply: LocomotiveSupply;
} {
  const number = lowestAvailableLoco(supply);
  if (number === null) throw new GameError('LOCO_SUPPLY_EMPTY', 'No locomotives remain in the supply');
  if (number === LOCO_TEN) {
    const tens: readonly [number, number] =
      supply.tens[0] > 0 ? [supply.tens[0] - 1, supply.tens[1]] : [supply.tens[0], supply.tens[1] - 1];
    return { number, supply: { ...supply, tens } };
  }
  return { number, supply: { ...supply, stacks: { ...supply.stacks, [number]: supply.stacks[number]! - 1 } } };
}

/**
 * Return a flipped locomotive to the supply as a factory (pg. 11): grows the returned-factory pool for that
 * **number** by one (a factory keeps its number — pg. 13 — so which number matters for RR5 builds).
 */
export function returnFactory(supply: LocomotiveSupply, number: number): LocomotiveSupply {
  const returnedFactories = { ...supply.returnedFactories, [number]: (supply.returnedFactories[number] ?? 0) + 1 };
  return { ...supply, returnedFactories };
}

/** The distinct returned-factory numbers currently in the supply (pg. 12 — the "or any returned factory" set). */
export function availableReturnedFactories(supply: LocomotiveSupply): number[] {
  return Object.keys(supply.returnedFactories)
    .map(Number)
    .filter((n) => supply.returnedFactories[n]! > 0) // key came from Object.keys, so the value is defined
    .sort((a, b) => a - b);
}

/**
 * Take one returned factory of `number` from the supply (pg. 12): decrements its pool. Throws
 * `NO_SUCH_FACTORY` if none of that number are available (the caller/`legalActions` only offers real ones).
 */
export function takeReturnedFactory(supply: LocomotiveSupply, number: number): LocomotiveSupply {
  if ((supply.returnedFactories[number] ?? 0) <= 0) {
    throw new GameError('NO_SUCH_FACTORY', `No returned #${number} factory in the supply`);
  }
  return {
    ...supply,
    returnedFactories: { ...supply.returnedFactories, [number]: supply.returnedFactories[number]! - 1 },
  };
}

/**
 * Can a factory be built right now (pg. 12)? — either the lowest-numbered locomotive is available, or at
 * least one returned factory sits in the supply. Gates the "or factory" option on a loco action space.
 */
export function canBuildFactory(supply: LocomotiveSupply): boolean {
  return lowestAvailableLoco(supply) !== null || availableReturnedFactories(supply).length > 0;
}

/**
 * Could a loco/factory action space that needs **both** a locomotive and a factory (the 3-worker space,
 * pg. 12) be satisfied from this supply? The loco takes one lowest tile; the factory then needs another
 * (a second lowest loco, or a returned factory). A conservative pre-check: the loco is available and,
 * after taking it, a factory is still buildable.
 */
export function canBuildLocoAndFactory(supply: LocomotiveSupply): boolean {
  if (lowestAvailableLoco(supply) === null) return false;
  return canBuildFactory(takeLowestLoco(supply).supply);
}

/** The locomotives a player currently has on a given route (pg. 10). */
export function locosOnRoute(player: LocoBoard, routeId: RouteId): Locomotive[] {
  return player.locomotives.filter((loco) => loco.route === routeId);
}

/** Does `route` have an empty locomotive slot (pg. 10 capacity: Trans-Siberian 2, St. Petersburg/Kyiv 1)? */
export function hasEmptyLocoSlot(player: LocoBoard, routeId: RouteId): boolean {
  return locosOnRoute(player, routeId).length < LOCO_CAPACITY[routeId];
}

/** Any empty locomotive slot on any of the player's routes (pg. 11 — the gate on flipping to a factory). */
export function anyEmptyLocoSlot(player: LocoBoard): boolean {
  return player.routes.some((route) => hasEmptyLocoSlot(player, route.id));
}

/**
 * One legal way to resolve a held locomotive under the pending-loco lock (pg. 10–11):
 *  - `place`  — put it on a route with an empty slot (ends the chain);
 *  - `replace`— upgrade a lower-numbered loco on a route (the displaced loco cascades);
 *  - `flip`   — turn it to a factory and return it to the supply (only when no empty slot remains).
 */
export type LocoResolution =
  | { readonly kind: 'place'; readonly route: RouteId }
  | { readonly kind: 'replace'; readonly route: RouteId; readonly number: number }
  | { readonly kind: 'flip' };

/**
 * Every legal resolution of a held locomotive numbered `pending` for `player` (pg. 10–11) — the exact, small
 * enumeration the second pending lock buys (place / upgrade / flip), drives `legalActions` and the UI. A
 * `place` for each route with an empty slot; a `replace` for each **distinct** lower-numbered loco on a
 * route (deduped so two identical locos on the Trans-Siberian offer one interchangeable target); a `flip`
 * only when the player has no empty locomotive slot anywhere (the pg. 11 constraint).
 */
export function locoResolutions(player: LocoBoard, pending: number): LocoResolution[] {
  const out: LocoResolution[] = [];
  for (const route of player.routes) {
    if (hasEmptyLocoSlot(player, route.id)) out.push({ kind: 'place', route: route.id });
  }
  const seen = new Set<string>();
  for (const route of player.routes) {
    for (const loco of locosOnRoute(player, route.id)) {
      const key = `${route.id}:${loco.number}`;
      if (loco.number < pending && !seen.has(key)) {
        seen.add(key);
        out.push({ kind: 'replace', route: route.id, number: loco.number });
      }
    }
  }
  if (!anyEmptyLocoSlot(player)) out.push({ kind: 'flip' });
  return out;
}
