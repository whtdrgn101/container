// @game-hub/kernel — the small set of primitives every game *and* both hosts share (Track D / D0).
//
// Extracted out of `engine/src/kernel/` so a game can eventually live in its own package: the engine,
// the backend `GameModule` contract, and the UI `GameClient` contract all build against this one
// neutral dependency instead of reaching into each other. Deliberately tiny — this is not a game
// framework. Game *rules* and *state shapes* stay inside each game; only what turned out genuinely
// cross-game lives here: the error type, the move-record/viewer shapes, the end-state union
// (REVIEW.md §3.1), the `record()` version/log mechanism, the seat helpers (REVIEW.md §3.2), and the
// two host↔game contracts.
//
// The `.` barrel is framework-free (no React, no Fastify) so the engine and backend can import it
// without dragging either in. The UI's React-dependent `GameClient`/`BoardProps` contract lives behind
// the `@game-hub/kernel/client` subpath instead (see `contracts/client.ts`).

// Engine primitives.
export { GameError } from './errors';
export type { MoveRecord } from './moveRecord';
export type { Viewer } from './viewer';
export { record } from './record';
export type { VersionedState } from './record';
export { makeSeating } from './seating';
export type { SeatedState, SeatHelpers } from './seating';
export type { GameEndState, WinnersEndState } from './endState';

// The backend `GameModule` contract (host bindings are generic parameters — see `contracts/module.ts`).
export type {
  GameModule,
  ModuleContext,
  ModuleGames,
  BotDriver,
  ParseResult,
  ErrorResponse,
  GameSummary,
} from './contracts/module';
