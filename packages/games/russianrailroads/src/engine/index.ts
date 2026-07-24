// Public API of @game-hub/game-russianrailroads/engine. Consumers (the module, the client) import only
// from here. The scaffold (RR1: the worker-placement spine); the surface grows one slice at a time.

// Domain types
export type { Action, ActionType } from './actions';
export type {
  ActionSpaceDef,
  ActionSpaceKind,
  EndBonusCard,
  Engineer,
  EngineerAction,
  EngineerStack,
  Industry,
  Locomotive,
  MoveRecord,
  Route,
  RouteDef,
  RouteId,
  RussianRailroadsPlayer,
  RussianRailroadsResult,
  RussianRailroadsState,
  RussianRailroadsSupplies,
  SpacePlacement,
  TrackColor,
} from './core';

// Errors
export { GameError } from './core';
export type { RussianRailroadsErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds)
export {
  ACTION_SPACES,
  actionSpace,
  COINS_PER_ACTION,
  END_BONUS_CARDS,
  ENGINEERS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROUNDS,
  ROUTES,
  STARTING_COINS,
  STARTING_LOCOMOTIVE,
  STARTING_WORKERS,
} from './core';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection — redacts opponents' held end-bonus card + the end-bonus pile contents.
export { viewFor } from './view';
export type { PlayerView, RussianRailroadsView, Viewer } from './view';

// Mechanics + turn-aware entry point.
export { applyAction, legalActions, pass, place } from './actions';
