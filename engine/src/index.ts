// Public API of @container/engine. Consumers (backend, ui) import only from here.

// Domain types
export { COLORS } from './core';
export type { Color } from './core';
export type { Action, ActionType } from './actions';
export { SCORING_CARDS } from './core';
export type {
  District,
  Factory,
  GameState,
  MoveRecord,
  PlayerState,
  ScoringCard,
  ShipLocation,
  ShipState,
  StoredContainer,
  Supply,
} from './core';

// Errors
export { GameError } from './core';
export type { GameErrorCode } from './core';

// Constants (rulebook-sourced tuning values used by the UI)
export {
  ACTIONS_PER_TURN,
  DEFAULT_FACTORY_LOT,
  FACTORY_BUILD_COSTS,
  FACTORY_LOT_PRICES,
  FACTORY_STORAGE_PER_FACTORY,
  HARBOR_LOT_PRICES,
  MAX_FACTORIES,
  MAX_PLAYERS,
  MAX_WAREHOUSES,
  MIN_PLAYERS,
  SHIP_CAPACITY,
  STARTING_MONEY,
  UNION_WAGE,
  WAREHOUSE_BUILD_COSTS,
  WAREHOUSE_STORAGE_PER_WAREHOUSE,
} from './core';

// Setup + state accessors
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';
export { getPlayer } from './internal';

// Mechanics + turn-aware entry point
export {
  produce,
  reprice,
  sail,
  factoryPurchase,
  harborPurchase,
  deliver,
  buildFactory,
  buildWarehouse,
  endTurn,
  applyAction,
  legalActions,
} from './actions';
