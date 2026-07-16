import { containerClient } from './container';
import type { GameClient } from './types';

/**
 * A registered client with its state type erased.
 *
 * The registry is heterogeneous by nature — only a game's own board may pair itself with its own
 * state type, and TypeScript has no way to say "some `S`, but consistently" for a value in a list.
 * (The backend's `AnyGameModule` gets this free from method bivariance; React props are ordinary
 * contravariant properties, so the same trick doesn't apply here.)
 *
 * So there is exactly **one cast, at registration below**, and this is the invariant that makes it
 * sound: a board is only ever rendered for a payload whose `gameType` selected it, so it only ever
 * receives a state its own game produced. Keep the cast confined to that one line — a `GameClient<S>`
 * is fully typed everywhere else, which is what keeps `unknown` out of board components.
 */
export type AnyGameClient = GameClient<unknown>;

/**
 * The games this room can render. One line per game — adding a second is meant to be additive.
 *
 * Deliberately keyed by the same ids the backend registers (`GET /games/catalog`). The **server** is
 * the authority on what exists; this is only how to *draw* it. A game the server hosts but this build
 * has no client for is a real state (someone deployed a backend ahead of a UI), and the shell says so
 * rather than rendering a blank board.
 */
const CLIENTS: readonly AnyGameClient[] = [
  // The one erasure — see `AnyGameClient` for why it's needed and what keeps it sound.
  containerClient as unknown as AnyGameClient,
];

export const clientFor = (gameType: string): AnyGameClient | undefined =>
  CLIENTS.find((client) => client.id === gameType);

/** Every game this build can draw, for cross-checking against the server's catalog. */
export const knownGameTypes = (): string[] => CLIENTS.map((client) => client.id);
