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
// Container ships as its own package now (Track D phase 5); the named singleton comes from there.
export { containerModule } from '@game-hub/game-container/module';
// Can't Stop ships as its own package now (Track D phase 2); the named singleton comes from there.
export { cantStopModule } from '@game-hub/game-cantstop/module';
// Stone Age ships as its own package now (Track D phase 3); the named singleton comes from there.
export { stoneAgeModule } from '@game-hub/game-stoneage/module';
// Saint Petersburg ships as its own package now (Track D phase 4); the named singleton comes from there.
export { stPetersburgModule } from '@game-hub/game-stpetersburg/module';

// The generated registry (from `games.config.ts`): `createDefaultRegistry` + `DEFAULT_GAME_ID`.
export { createDefaultRegistry, DEFAULT_GAME_ID } from './index.generated';
