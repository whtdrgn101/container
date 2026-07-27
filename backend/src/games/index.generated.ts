// DO NOT EDIT — generated from games.config.ts by scripts/generate-registries.ts.
// Run `pnpm generate` to regenerate. The registration invariants (config order, duplicate-id boot
// crash, seat-bound validation) live in the hand-written registry this feeds.
import { GameRegistry } from './registry';
import containerModule from '@game-hub/game-container/module';
import cantstopModule from '@game-hub/game-cantstop/module';
import stoneageModule from '@game-hub/game-stoneage/module';
import stpetersburgModule from '@game-hub/game-stpetersburg/module';
import russianrailroadsModule from '@game-hub/game-russianrailroads/module';

/**
 * The games this site hosts, registered in config order. A factory rather than a shared singleton: the
 * backend tests build many apps against their own in-memory databases, and a registry that outlived one
 * of them would be a cross-test leak.
 */
export const createDefaultRegistry = (): GameRegistry =>
  new GameRegistry()
    .register(containerModule)
    .register(cantstopModule)
    .register(stoneageModule)
    .register(stpetersburgModule)
    .register(russianrailroadsModule);

/** The id every existing row is backfilled to when C1 adds `game_type` (the first hosted game). */
export const DEFAULT_GAME_ID = 'container';
