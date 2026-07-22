// Public API of @game-hub/engine/stpetersburg. Consumers (backend, ui) import only from here.
// The scaffold (roadmap SP0); the surface grows one slice at a time.

// Domain types
export type { Action, ActionType } from './actions';
export type {
  Board,
  Card,
  CardDef,
  CardKind,
  MoveRecord,
  Phase,
  PlayArea,
  SpecialId,
  StPetersburgPlayer,
  StPetersburgResult,
  StPetersburgState,
  TradingGroup,
  Ware,
} from './core';

// Errors
export { GameError } from './core';
export type { StPetersburgErrorCode } from './core';

// Constants (rulebook-sourced values used by the UI + backend seat bounds + the deck totals)
export {
  ARISTOCRAT_SCORE,
  BOARD_SIZE,
  CARD_DEFS,
  CARD_KINDS,
  deckCount,
  MAX_PLAYERS,
  MIN_CARD_COST,
  MIN_PLAYERS,
  PHASES,
  STARTING_RUBLES,
  WORKER_ROW_SEED,
} from './core';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection — redacts opponents' rubles + hands and the draw-stack contents (SP0 headline)
export { viewFor } from './view';
export type { BoardView, PlayerView, StPetersburgView, Viewer } from './view';

// Mechanics + turn-aware entry point. `effectiveCost`/`costReductions` are exported so the UI can show a
// card's real price (printed cost struck through when reductions apply) with the exact rule the buy charges.
export { applyAction, buy, costReductions, effectiveCost, legalActions, pass } from './actions';
