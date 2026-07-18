// Public API of @game-hub/engine/stoneage. Consumers (backend, ui) import only from here.
// The scaffold (roadmap SA0); the surface grows one action per stage.

// Domain types
export type { Action, ActionType } from './actions';
export type {
  Building,
  BuildingCost,
  BuildingPlaceId,
  FixedPlaceId,
  GatherPlaceId,
  MoveRecord,
  PendingGather,
  Phase,
  PlaceId,
  ResourcePlaceId,
  Resource,
  StoneAgePlayer,
  StoneAgeState,
} from './core';

// Errors
export { GameError } from './core';
export type { StoneAgeErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds)
export {
  ALL_PLACES,
  BUILDING_DECK,
  BUILDING_PLACES,
  BUILDING_STACK_SIZE,
  CIV_CARD_SLOTS,
  DIE_FACES,
  HUNT_THRESHOLD,
  MAX_BUILDING_STACKS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PLACE_CAPACITY,
  PLACE_RESOURCE,
  PLACES,
  RESOURCE_PLACES,
  RESOURCE_THRESHOLD,
  RESOURCE_VALUE,
  RESOURCES,
  STARTING_FOOD,
  STARTING_PEOPLE,
  STARVATION_PENALTY,
} from './core';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection (near-identity — Stone Age is a public-information Euro)
export { viewFor } from './view';
export type { StoneAgeView, Viewer } from './view';

// Helpers the UI reads (people still to place; which places roll dice / are used / are building slots).
export {
  availableToPlace,
  buildingIndex,
  buildingPaymentError,
  buildingPlaceId,
  isBuildingPlace,
  isGatherPlace,
  isResourcePlace,
  isUsePlace,
  paymentValue,
  placedBy,
} from './internal';
export type { Payment } from './internal';

// Mechanics + turn-aware entry point. `gather` (the roll) is server-only; `takeGather` finalizes it.
export { place, gather, takeGather, use, build, feed, applyAction, legalActions } from './actions';
