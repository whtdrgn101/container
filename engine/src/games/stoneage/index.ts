// Public API of @game-hub/engine/stoneage. Consumers (backend, ui) import only from here.
// The scaffold (roadmap SA0); the surface grows one action per stage.

// Domain types
export type { Action, ActionType } from './actions';
export type { MoveRecord, Phase, PlaceId, Resource, StoneAgePlayer, StoneAgeState } from './core';

// Errors
export { GameError } from './core';
export type { StoneAgeErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds)
export {
  BUILDING_STACK_SIZE,
  CIV_CARD_SLOTS,
  DIE_FACES,
  HUNT_THRESHOLD,
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

// Helpers the UI reads (people still to place; which places a seat can gather from).
export { availableToPlace, isResourcePlace, placedBy } from './internal';

// Mechanics + turn-aware entry point. `gather` is server-only (the roll route builds its dice).
export { place, gather, applyAction, legalActions } from './actions';
