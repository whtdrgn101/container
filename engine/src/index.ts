export { COLORS } from './colors';
export type { Color } from './colors';
export { GameError } from './errors';
export type { GameErrorCode } from './errors';
export type { Factory, GameState, MoveRecord, PlayerState } from './types';
export {
  createGame,
  getPlayer,
  produce,
  FACTORY_STORAGE_PER_FACTORY,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_MONEY,
  UNION_WAGE,
} from './game';
export type { CreateGameOptions, NewPlayer } from './game';
