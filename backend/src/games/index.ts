import { containerModule } from './container';
import { GameRegistry } from './registry';

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
export { containerModule } from './container';

/**
 * The games this site hosts. Container is first and, for now, only — adding a second is meant to be
 * additive: implement `GameModule`, register it here, done.
 *
 * A factory rather than a shared singleton: the backend tests build many apps against their own
 * in-memory databases, and a registry that outlived one of them would be a cross-test leak.
 */
export const createDefaultRegistry = (): GameRegistry => new GameRegistry().register(containerModule);

/** The id every existing row is backfilled to when C1 adds `game_type`. */
export const DEFAULT_GAME_ID = containerModule.id;
