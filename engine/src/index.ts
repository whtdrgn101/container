export { COLORS } from './colors';
export type { Color } from './colors';
export type { Action, ActionType } from './actions';
export { GameError } from './errors';
export type { GameErrorCode } from './errors';
export type { Factory, GameState, MoveRecord, PlayerState, Supply } from './types';
export {
  createGame,
  getPlayer,
  produce,
  buildFactory,
  buildWarehouse,
  endTurn,
  applyAction,
  legalActions,
  ACTIONS_PER_TURN,
  FACTORY_BUILD_COSTS,
  FACTORY_STORAGE_PER_FACTORY,
  MAX_FACTORIES,
  MAX_PLAYERS,
  MAX_WAREHOUSES,
  MIN_PLAYERS,
  STARTING_MONEY,
  UNION_WAGE,
  WAREHOUSE_BUILD_COSTS,
  WAREHOUSE_STORAGE_PER_WAREHOUSE,
} from './game';
export type { CreateGameOptions, NewPlayer } from './game';
