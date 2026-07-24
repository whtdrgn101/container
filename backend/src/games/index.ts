// The backend games barrel. The **registry wiring** — which modules are registered, in what order — is
// generated from the root `games.config.ts` into `./index.generated` (run `pnpm generate`). This file
// stays hand-written for the stable surface everything else imports: the contract types, the registry
// class, and each game's named module singleton (which the tests reference directly).

export type {
  BotDriver,
  ErrorResponse,
  GameModule,
  GameSummary,
  ModuleContext,
  ModuleGames,
  MoveRecord,
  ParseResult,
  Viewer,
} from './module';
export type { AnyGameModule, GameInfo } from './registry';
export { GameRegistry } from './registry';

// Named module singletons — kept for the many callers that reference a specific module (tests, and
// `parseAction`/error-map wiring). The registry itself is built from the default exports in the
// generated file below.
export { containerModule } from './container';
export { cantStopModule } from './cantstop';
export { stoneAgeModule } from './stoneage';
export { stPetersburgModule } from './stpetersburg';

// The generated registry (from `games.config.ts`): `createDefaultRegistry` + `DEFAULT_GAME_ID`.
export { createDefaultRegistry, DEFAULT_GAME_ID } from './index.generated';
