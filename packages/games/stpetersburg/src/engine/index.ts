// Public API of @game-hub/game-stpetersburg/engine. Consumers (backend, ui) import only from here.
// The scaffold (roadmap SP0); the surface grows one slice at a time.

// Domain types
export type { Action, ActionType } from './actions';
export type {
  Board,
  Card,
  CardDef,
  CardKind,
  MoveRecord,
  PendingDraw,
  PendingPubBuy,
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
  HAND_LIMIT,
  handLimit,
  MAX_PLAYERS,
  MIN_CARD_COST,
  MIN_PLAYERS,
  PHASES,
  POTEMKIN_DISPLACE_VALUE,
  PUB_MAX_POINTS,
  PUB_POINT_COST,
  STARTING_RUBLES,
  WAREHOUSE_HAND_LIMIT,
  WORKER_ROW_SEED,
} from './core';

// Setup
export { createGame } from './createGame';
export type { CreateGameOptions, NewPlayer } from './createGame';

// Per-player view projection — redacts opponents' rubles + hands and the draw-stack contents (SP0 headline)
export { viewFor } from './view';
export type { BoardView, PlayerView, StPetersburgView, Viewer } from './view';

// Mechanics + turn-aware entry point. `effectiveCost`/`handCost`/`costReductions`/`displacementCost` are
// exported so the UI can show a card's real price (printed cost struck through when reductions apply, and
// the trading-card difference math) with the exact rule the buy / hand-play charges. `legalDisplaceTargets`
// lets the UI build a trading card's displacement picker (pg. 7).
export {
  addToHand,
  applyAction,
  buy,
  costReductions,
  displacementCost,
  effectiveCost,
  handCost,
  legalActions,
  pass,
  playFromHand,
} from './actions';
export { legalDisplaceTargets, unusedObservatories } from './internal';
