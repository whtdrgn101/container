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
  FactoryAction,
  IdeaCardId,
  IdeaTokenType,
  Industry,
  IndustryEntry,
  Locomotive,
  LocomotiveSupply,
  MoveRecord,
  PendingFactory,
  PendingLoco,
  PendingMoves,
  PoolEntry,
  Route,
  RouteDef,
  RouteId,
  RouteSpecial,
  RussianRailroadsPlayer,
  RussianRailroadsResult,
  RussianRailroadsState,
  RussianRailroadsSupplies,
  SpacePlacement,
  SpecialType,
  StartingBonusCard,
  TrackColor,
  TrackExtension,
} from './core';

// Errors
export { GameError } from './core';
export type { RussianRailroadsErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds)
export {
  ACTION_SPACES,
  actionSpace,
  COINS_PER_ACTION,
  COLOR_MOVES,
  DOUBLER_SPACES,
  DOUBLER_SUPPLY,
  END_BONUS_CARDS,
  ENGINEERS,
  FACTORY_ACTIONS,
  factoryAction,
  GAP_LANE_INDICES,
  IDEA_CARDS,
  IDEA_TOKEN_TYPES,
  INDUSTRY_END,
  INDUSTRY_GAPS,
  INDUSTRY_IDEA_LANE_INDEX,
  INDUSTRY_LANE,
  industryPointsAt,
  isTurnOrderSpace,
  KEY_POINTS,
  LOCO_CAPACITY,
  LOCO_STACK_NUMBERS,
  LOCO_TEN,
  MAX_PLAYERS,
  MIN_PLAYERS,
  passPoints,
  ROUNDS,
  ROUTES,
  routeColors,
  SPECIALS,
  STARTING_BONUS_CARDS,
  STARTING_COINS,
  STARTING_LOCOMOTIVE,
  STARTING_WORKERS,
  TEMP_WORKERS,
  TRACK_COLORS,
  turnOrderOrdinal,
  TURN_ORDER_PASS_POINTS,
  TURN_ORDER_SPACES,
  TWENTY_POINTS,
  UNLOCK_SPACE,
  VALUATION,
  VALUATION_REVALUED,
} from './core';

// Track-extension helpers the client shares (which routes a lock can advance) — DRY with the engine.
export { legalSteps } from './internal';
export type { TrackStep } from './internal';

// Locomotive helpers the client shares (per-route locos, the place/upgrade/flip resolutions) — DRY.
export { locoResolutions, locosOnRoute } from './internal';
export type { LocoResolution } from './internal';

// Industry helpers the client shares (gap slots, wrench scoring) — DRY with the engine.
export { allGapsFilled, availableReturnedFactories, firstUnfilledGap, industryScore } from './internal';

// Specials helpers the client shares (which specials are met, route doubling, bonus-star scoring) — DRY.
export { bonusStarScore, frontierIndex, routeDoubled, specialMet } from './internal';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection — redacts opponents' held end-bonus card + the end-bonus pile contents.
export { viewFor } from './view';
export type { PlayerView, RussianRailroadsView, Viewer } from './view';

// Mechanics + turn-aware entry point.
export {
  applyAction,
  legalActions,
  moveTrack,
  pass,
  place,
  resolveIdeaCard,
  resolveIdeaToken,
  resolveKey,
  resolveReuse,
  resolveSetupBonus,
} from './actions';
