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
//
// ⚠️ **Relative imports in shipped kernel files carry an explicit `.js` extension** (Track D / D2a).
// Unlike every other package here, the kernel is *published* and consumed from `dist/` — plain Node ESM
// does not do extension resolution, so an extensionless `from './errors'` emits verbatim and the
// installed package throws `ERR_MODULE_NOT_FOUND` on the first import. `.js` specifiers resolve to the
// `.ts` source in-workspace (TS, Vite, Vitest and esbuild all do the `.js`→`.ts` mapping) *and* to the
// emitted `.js` in the tarball, so one spelling serves both. Test files are excluded from the build and
// keep the extensionless style. `scripts/pack-smoke.mjs` is what catches a regression here.

// The host↔game contract version (design doc §4). Its own module so a game can import the number
// without pulling anything else in.
export { KERNEL_CONTRACT_VERSION } from './contract.js';

// Engine primitives.
export { GameError } from './errors.js';
export type { MoveRecord } from './moveRecord.js';
// `RecordTypeOf` is exported because a game that types its log may want to name the same union in its
// own helpers (a `describeMoveRecord` switch, a test's record assertions) without restating it.
export type { RecordTypeOf } from './record.js';
export type { Viewer } from './viewer.js';
export { record } from './record.js';
export type { VersionedState } from './record.js';
export { makeSeating } from './seating.js';
// Seeded setup randomness (kernel 1.2.0). Here rather than only on `./bot` because an *engine* deals
// its game and an engine *test* seeds it — neither may reach into the bot subpath to do so.
export { mulberry32, shuffle } from './random.js';
export type { SeatedState, SeatHelpers } from './seating.js';
export type { GameEndState, WinnersEndState } from './endState.js';

// The game-agnostic bot drive-loop, shared by every game's backend runner (REVIEW §3.4). It imports no
// host and reads only a structural slice of state, so it is kernel code (Track D — legacy-migration
// decision 5). Each game package's bot runner imports `runBotLoop` from here directly.
export { runBotLoop } from './botLoop.js';
export type { BotLoopState, PreStepResult, BotLoopOptions } from './botLoop.js';

// The backend `GameModule` contract (host bindings are generic parameters — see `contracts/module.ts`).
export type {
  GameModule,
  ModuleContext,
  ModuleGames,
  ModuleHub,
  ModuleBotSeats,
  BotDriver,
  ParseResult,
  ErrorResponse,
  GameSummary,
} from './contracts/module.js';

// Table options (kernel 1.5.0) — the per-table rule variants a game declares and a table picks before
// the deal. The two helpers are **runtime** code and live here rather than in the hub on purpose: what
// counts as a legal pick is the contract's rule, so a host, a second host, and a game's own tests must
// all get the same answer from the same function. See `contracts/tableOptions.ts` for the design.
export { defaultTableOptions, resolveTableOptions } from './contracts/tableOptions.js';
export type {
  BooleanTableOption,
  ChoiceTableOption,
  ResolveOptionsResult,
  TableOptions,
  TableOptionSpec,
  TableOptionValue,
} from './contracts/tableOptions.js';
