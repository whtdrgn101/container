import type { District, StoredContainer } from '@container/engine';
import type { Ctx } from '../types';

/** Below this much cash the bot prices to move stock fast; above it, it prices for margin. */
const CASH_PRESSURE = 6;

/** Factory lots are $1–$6. Cheap stock is what tempts opponents to truck it away. */
export function factoryAskingPrice(ctx: Ctx): number {
  return ctx.me.money < CASH_PRESSURE ? 2 : 3;
}

/** Harbor lots are $2–$7, and sit one step above factory prices — that spread is the reseller's cut. */
export function harborAskingPrice(ctx: Ctx): number {
  return ctx.me.money < CASH_PRESSURE ? 3 : 4;
}

/**
 * Choose what to Produce, or `null` if there is nothing the bot can produce.
 *
 * Produce is all-or-nothing at its full size: the engine makes exactly `min(producible, room)`
 * containers and you may not choose to make fewer (rulebook pg. 9 — "you must produce as many as you
 * are able to"). "Producible" excludes colors the supply has run out of, so the bot's only real
 * choice is *which* colors to run when room is tight, and at what price.
 */
export function producePlacements(ctx: Ctx): StoredContainer[] | null {
  const { me, view } = ctx;
  const room = me.factoryLimit - me.factoryStore.length;

  // Produce the colors the supply is deepest in. Every container drawn ticks the game-end clock
  // (2 exhausted colors ends it), so draining an already-scarce color hands rivals the timing.
  const producible = me.factories
    .filter((factory) => view.supply.containers[factory.color] > 0)
    .sort((a, b) => view.supply.containers[b.color] - view.supply.containers[a.color]);

  const capacity = Math.min(producible.length, room);
  if (capacity <= 0) {
    return null;
  }

  const price = factoryAskingPrice(ctx);
  return producible.slice(0, capacity).map((factory) => ({ color: factory.color, price }));
}

/**
 * Re-price a district to the bot's current asking price, or `null` when it already is — repricing to
 * the prices you already have would burn one of your two actions for nothing.
 */
export function repriceArrangement(ctx: Ctx, district: District): StoredContainer[] | null {
  const current = district === 'factory' ? ctx.me.factoryStore : ctx.me.harborStore;
  if (current.length === 0) {
    return null;
  }
  const price = district === 'factory' ? factoryAskingPrice(ctx) : harborAskingPrice(ctx);
  if (current.every((container) => container.price === price)) {
    return null;
  }
  return current.map((container) => ({ color: container.color, price }));
}

/**
 * Take the cheapest containers first, stopping at whichever runs out first: budget or room.
 * Shared by both purchase policies — buy low is the whole strategy.
 */
export function affordableContainers(
  offered: readonly StoredContainer[],
  budget: number,
  room: number,
): StoredContainer[] {
  const taken: StoredContainer[] = [];
  let spent = 0;
  for (const container of [...offered].sort((a, b) => a.price - b.price)) {
    if (taken.length >= room || spent + container.price > budget) {
      break;
    }
    taken.push(container);
    spent += container.price;
  }
  return taken;
}
