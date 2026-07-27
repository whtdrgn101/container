// DO NOT EDIT — generated from games.config.ts by scripts/generate-registries.ts.
// Run `pnpm generate` to regenerate. The registration invariants (config order, duplicate-id boot
// crash, seat-bound validation) live in the hand-written registry this feeds.
import type { GameClient } from './types';
import containerClient from '@game-hub/game-container/client';
import cantstopClient from '@game-hub/game-cantstop/client';
import stoneageClient from '@game-hub/game-stoneage/client';
import stpetersburgClient from '@game-hub/game-stpetersburg/client';
import russianrailroadsClient from '@game-hub/game-russianrailroads/client';

/**
 * A registered client with its state type erased. Only a game's own board may pair itself with its own
 * state type, and TypeScript can't say "some `S`, but consistently" for a value in a list — so there is
 * exactly one cast per game below. What makes it sound: a board is only ever rendered for a payload
 * whose `gameType` selected it, so it only ever receives a state its own game produced. See
 * `registry.ts` for the fuller note.
 */
export type AnyGameClient = GameClient<unknown>;

/** The games this room can draw, in config order. Cross-checked against the server catalog by the shell. */
export const CLIENTS: readonly AnyGameClient[] = [
  containerClient as unknown as AnyGameClient,
  cantstopClient as unknown as AnyGameClient,
  stoneageClient as unknown as AnyGameClient,
  stpetersburgClient as unknown as AnyGameClient,
  russianrailroadsClient as unknown as AnyGameClient,
];
