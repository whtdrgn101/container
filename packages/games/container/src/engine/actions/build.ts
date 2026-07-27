import {
  FACTORY_BUILD_COSTS,
  FACTORY_STORAGE_PER_FACTORY,
  GameError,
  MAX_FACTORIES,
  MAX_WAREHOUSES,
  WAREHOUSE_BUILD_COSTS,
  WAREHOUSE_STORAGE_PER_WAREHOUSE,
} from '../core';
import type { Color, GameState, PlayerState, Supply } from '../core';
import { record, seatOf, withPlayer } from '../internal';

/**
 * Build a factory (rulebook pg. 8): pay the next factory-track cost to the supply and add a factory
 * of a color you don't already have. Increases your factory storage limit by 2.
 */
export function buildFactory(state: GameState, playerId: string, color: Color): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.factories.length >= MAX_FACTORIES) {
    throw new GameError('FACTORY_LIMIT_REACHED', `Player "${playerId}" already has ${MAX_FACTORIES} factories`);
  }
  if (player.factories.some((factory) => factory.color === color)) {
    throw new GameError('DUPLICATE_FACTORY_COLOR', `Player "${playerId}" already has a ${color} factory`);
  }
  if (state.supply.factories[color] <= 0) {
    throw new GameError('OUT_OF_SUPPLY', `No ${color} factory buildings left in the supply`);
  }

  const cost = FACTORY_BUILD_COSTS[player.factories.length - 1]!;
  if (player.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford the $${cost} factory`);
  }

  const updated: PlayerState = {
    ...player,
    money: player.money - cost,
    factories: [...player.factories, { id: `${playerId}-f${player.factories.length + 1}`, color }],
    factoryLimit: player.factoryLimit + FACTORY_STORAGE_PER_FACTORY,
  };
  const supply: Supply = {
    ...state.supply,
    factories: { ...state.supply.factories, [color]: state.supply.factories[color] - 1 },
  };

  return record(state, withPlayer(state, seat, updated), 'BUILD_FACTORY', playerId, { supply }, { color, cost });
}

/**
 * Build a warehouse (rulebook pg. 8): pay the next warehouse-track cost to the supply and add a
 * warehouse. Increases your harbor storage limit by 1.
 */
export function buildWarehouse(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.warehouses >= MAX_WAREHOUSES) {
    throw new GameError('WAREHOUSE_LIMIT_REACHED', `Player "${playerId}" already has ${MAX_WAREHOUSES} warehouses`);
  }
  if (state.supply.warehouses <= 0) {
    throw new GameError('OUT_OF_SUPPLY', 'No warehouse buildings left in the supply');
  }

  const cost = WAREHOUSE_BUILD_COSTS[player.warehouses - 1]!;
  if (player.money < cost) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford the $${cost} warehouse`);
  }

  const updated: PlayerState = {
    ...player,
    money: player.money - cost,
    warehouses: player.warehouses + 1,
    harborLimit: player.harborLimit + WAREHOUSE_STORAGE_PER_WAREHOUSE,
  };
  const supply: Supply = { ...state.supply, warehouses: state.supply.warehouses - 1 };

  return record(state, withPlayer(state, seat, updated), 'BUILD_WAREHOUSE', playerId, { supply }, { cost });
}
