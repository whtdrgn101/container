// DO NOT EDIT — generated from games.config.ts by scripts/generate-registries.ts.
// Run `pnpm generate` to regenerate. The registration invariants (config order, duplicate-id boot
// crash, seat-bound validation) live in the hand-written registry this feeds.
import type { GameClient } from './types';
import containerClient from '@game-hub/game-container/client';
import cantstopClient from '@game-hub/game-cantstop/client';
import stoneageClient from '@game-hub/game-stoneage/client';
import stpetersburgClient from '@game-hub/game-stpetersburg/client';
import russianrailroadsClient from '@game-hub/game-russianrailroads/client';
import labyrinthClient from '@game-hub/game-labyrinth/client';
import arguteClient from '@game-hub/game-argute/client';

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
  labyrinthClient as unknown as AnyGameClient,
  arguteClient as unknown as AnyGameClient,
];

/**
 * Each game's installed package version, by id — what the footer prints beside the game's name so a
 * running table says exactly which build of the game it is. Read off the installed package at generate
 * time (`GameClient` carries no version of its own), so this tracks the tarball on disk.
 */
export const GAME_VERSIONS: Readonly<Record<string, string>> = {
  container: '0.1.1',
  cantstop: '0.1.1',
  stoneage: '0.1.1',
  stpetersburg: '0.1.1',
  russianrailroads: '0.1.1',
  labyrinth: '0.1.3',
  argute: '0.3.0',
};
