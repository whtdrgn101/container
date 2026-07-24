// Compat shim (Track D / D0): the engine kernel now lives in its own workspace package,
// `@game-hub/kernel`. Engine games still import their primitives from `'../../kernel'` (this file) and
// external consumers still import them from `'@game-hub/engine/kernel'` — both resolve here, and this
// re-export keeps that surface byte-identical to when the primitives lived under `engine/src/kernel/`.
//
// Only the framework-free primitives are surfaced here (exactly the old set); the kernel's host
// contracts (`GameModule`/`GameClient`) are for the backend and UI, which import `@game-hub/kernel`
// directly. See CLAUDE.md "How the shared engine is consumed".
export { GameError, record, makeSeating } from '@game-hub/kernel';
export type {
  MoveRecord,
  Viewer,
  VersionedState,
  SeatedState,
  SeatHelpers,
  GameEndState,
  WinnersEndState,
} from '@game-hub/kernel';
