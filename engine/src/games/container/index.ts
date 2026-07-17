// Public API of @game-hub/engine. Consumers (backend, ui) import only from here.

// Domain types
export { COLORS } from './core';
export type { Color } from './core';
export type { Action, ActionType, DeliveryOutcome, DeliveryResolution } from './actions';
export { SCORING_CARDS } from './core';
export type {
  BankAuction,
  BankState,
  District,
  Factory,
  GameState,
  MoveRecord,
  PlayerScore,
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
  LOAN_AMOUNT,
  LOAN_ENDGAME_COST,
  MAX_FACTORIES,
  MAX_LOANS,
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

// Per-player view projection (hidden-info redaction for online / AI)
export { viewFor } from './view';
export type { GameView, PlayerView, Viewer } from './view';

// Mechanics + turn-aware entry point
export {
  produce,
  reprice,
  sail,
  factoryPurchase,
  harborPurchase,
  deliver,
  // How a set of bids resolves (price + who is still level). The backend projects the pending
  // auction from it and the bot predicts the price with it — one copy of the tie rule, here.
  deliveryOutcome,
  // Whether the active player is pinned at the island owing a delivery auction. The backend needs
  // this to know when to open a pending auction (A1); the bot re-derives its own turn from it.
  mustDeliver,
  requestLoan,
  repayLoan,
  callBank,
  loadHolding,
  finalScoring,
  endGame,
  exhaustedColorCount,
  buildFactory,
  buildWarehouse,
  endTurn,
  applyAction,
  legalActions,
} from './actions';
