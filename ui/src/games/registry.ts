import { CLIENTS, GAME_VERSIONS } from './registry.generated';

/**
 * The UI games registry. The **client list** (`CLIENTS`) — which clients this build can draw, in what
 * order, and the one erasure cast per game — is generated from the root `games.config.ts` into
 * `./registry.generated` (run `pnpm generate`). This file stays hand-written for the lookups the shell
 * uses and the note explaining why the generated cast is sound.
 *
 * A registered client has its state type erased to `AnyGameClient`. The registry is heterogeneous by
 * nature — only a game's own board may pair itself with its own state type, and TypeScript has no way to
 * say "some `S`, but consistently" for a value in a list. (The backend's `AnyGameModule` gets this free
 * from method bivariance; React props are ordinary contravariant properties, so the same trick doesn't
 * apply here.)
 *
 * So there is exactly **one cast per game, in the generated file**, and this is the invariant that makes
 * it sound: a board is only ever rendered for a payload whose `gameType` selected it, so it only ever
 * receives a state its own game produced. Everything else stays fully typed against `GameClient<S>`,
 * which is what keeps `unknown` out of board components.
 *
 * Deliberately keyed by the same ids the backend registers (`GET /games/catalog`). The **server** is the
 * authority on what exists; this is only how to *draw* it. A game the server hosts but this build has no
 * client for is a real state (someone deployed a backend ahead of a UI), and the shell says so rather
 * than rendering a blank board.
 */
export type { AnyGameClient } from './registry.generated';

export const clientFor = (gameType: string) => CLIENTS.find((client) => client.id === gameType);

/** Every game this build can draw, for cross-checking against the server's catalog. */
export const knownGameTypes = (): string[] => CLIENTS.map((client) => client.id);

/**
 * The installed package version of a game, for the footer's version stamp — `undefined` when this build
 * has no version for that id, which the footer treats as "say nothing" rather than printing a blank.
 *
 * Baked into the generated file at `pnpm generate` time from the package actually installed, because
 * `GameClient` carries no version of its own. See `scripts/generate-registries.ts`.
 */
export const versionFor = (gameType: string): string | undefined => GAME_VERSIONS[gameType];
