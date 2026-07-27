import { DEFAULT_FACTORY_LOT, FACTORY_LOT_PRICES, GameError, UNION_WAGE } from '../core';
import type { GameState, StoredContainer } from '../core';
import { assertValidLots, colorsOf, isSubMultiset, record, seatOf } from '../internal';

/**
 * Produce action (rulebook pg. 8–9): pay $1 union wages to the player on your right (next seat), then
 * produce one container per factory up to the factory storage limit, arranging them in lots (their
 * sale prices). `placements` fully specifies the produced containers (colors + lot prices); it must
 * be a sub-multiset of your factory colors, sized to what fits. Omitted → produce what fits into the
 * default $2 lot.
 *
 * "You must produce as many containers as you are able to, up to your factory storage limit"
 * (pg. 9). Two things you are *not* able to produce, and both shrink the run rather than blocking it:
 * containers past your storage limit, and colors the supply has run out of.
 */
export function produce(state: GameState, playerId: string, placements?: readonly StoredContainer[]): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.factories.length === 0) {
    throw new GameError('NO_FACTORIES', `Player "${playerId}" has no factories to produce with`);
  }
  if (player.money < UNION_WAGE) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford $${UNION_WAGE} union wages`);
  }

  const room = player.factoryLimit - player.factoryStore.length;
  if (room <= 0) {
    throw new GameError('STORAGE_LIMIT_EXCEEDED', `Player "${playerId}" has no room to store new containers`);
  }

  const factoryColors = player.factories.map((factory) => factory.color);
  // A factory whose color is exhausted simply idles this turn — you are not "able to" produce it, so
  // it drops out of the run instead of making the whole action illegal. This matters in every game:
  // the supply running out is the end-game trigger, so late games always reach this state.
  const producibleColors = factoryColors.filter((color) => state.supply.containers[color] > 0);
  const capacity = Math.min(producibleColors.length, room);

  if (capacity === 0) {
    throw new GameError('OUT_OF_SUPPLY', `Player "${playerId}" has no factory colors left in the supply to produce`);
  }

  let produced: readonly StoredContainer[];
  if (placements === undefined) {
    produced = producibleColors.slice(0, capacity).map((color) => ({ color, price: DEFAULT_FACTORY_LOT }));
  } else {
    if (placements.length !== capacity) {
      throw new GameError(
        'INVALID_SELECTION',
        `Must produce exactly ${capacity} container(s), got ${placements.length}`,
      );
    }
    if (!isSubMultiset(colorsOf(placements), factoryColors)) {
      throw new GameError('INVALID_SELECTION', 'Selected colors do not match available factories');
    }
    assertValidLots(placements, FACTORY_LOT_PRICES);
    produced = placements;
  }

  // Draw the produced containers from the shared supply (factories are distinct colors, so ≤1 each).
  const containers = { ...state.supply.containers };
  for (const container of produced) {
    if (containers[container.color] <= 0) {
      throw new GameError('OUT_OF_SUPPLY', `No ${container.color} containers left in the supply`);
    }
    containers[container.color] -= 1;
  }

  const rightSeat = (seat + 1) % state.players.length;
  const players = state.players.map((current, index) => {
    if (index === seat) {
      return { ...current, money: current.money - UNION_WAGE, factoryStore: [...current.factoryStore, ...produced] };
    }
    if (index === rightSeat) {
      return { ...current, money: current.money + UNION_WAGE };
    }
    return current;
  });

  const supply = { ...state.supply, containers };
  return record(state, players, 'PRODUCE', playerId, { supply }, { produced: produced.map((c) => ({ ...c })) });
}
