// Public API of @game-hub/engine/cantstop. Consumers (backend, ui) import only from here.

// Domain types
export type { Action, ActionType } from './actions';
export type { CantStopPlayer, CantStopState, MoveRecord, Phase } from './core';

// Errors
export { GameError } from './core';
export type { CantStopErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds)
export {
  COLUMN_HEIGHTS,
  COLUMNS,
  DICE_COUNT,
  DIE_FACES,
  MAX_PLAYERS,
  MAX_RUNNERS,
  MIN_PLAYERS,
  WIN_COLUMNS,
} from './core';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection (a no-op here — Can't Stop has nothing to hide)
export { viewFor } from './view';
export type { CantStopView, Viewer } from './view';

// Mechanics + turn-aware entry point. `legalSelections` is exported so the UI/bot can enumerate
// pairings without re-deriving the rule; `roll` is server-only (the backend's roll route calls it).
export { legalSelections } from './internal';
export { applyAction, legalActions, roll, select, stop } from './actions';
