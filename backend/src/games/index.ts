import { cantStopModule } from './cantstop';
import { containerModule } from './container';
import { GameRegistry } from './registry';
import { stoneAgeModule } from './stoneage';

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
export { cantStopModule } from './cantstop';
export { stoneAgeModule } from './stoneage';

/**
 * The games this site hosts. Container came first; Can't Stop (roadmap C3) is the proof the seam is
 * real — two games running side by side on one server. Adding a game is additive: implement
 * `GameModule`, register it here, done.
 *
 * A factory rather than a shared singleton: the backend tests build many apps against their own
 * in-memory databases, and a registry that outlived one of them would be a cross-test leak.
 */
export const createDefaultRegistry = (): GameRegistry =>
  new GameRegistry().register(containerModule).register(cantStopModule).register(stoneAgeModule);

/** The id every existing row is backfilled to when C1 adds `game_type`. */
export const DEFAULT_GAME_ID = containerModule.id;
