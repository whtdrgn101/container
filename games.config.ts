/**
 * The ordered list of games this platform hosts (Track D / D0) — the single source of truth.
 *
 * `pnpm generate` turns this list into the two checked-in registries: the backend's
 * `backend/src/games/index.generated.ts` (imports each `module`, builds `createDefaultRegistry`) and
 * the UI's `ui/src/games/registry.generated.ts` (imports each `client`, builds the `CLIENTS` list).
 * Registration happens in config order, and a duplicate `id` still boot-crashes the registry. Adding a
 * game is: implement its module + client, add one entry here, run `pnpm generate`.
 *
 * `module`/`client` are **import specifiers** — written exactly as the generated file would import them,
 * and expected to expose the module/client as a **default export**. For an in-repo game that's a
 * relative path (`./container`, resolved from the generated file's own `games/` dir, identical on both
 * hosts). The shape is deliberately future-proof: a game that ships as its own package (D1+) is the
 * same entry with package specifiers instead —
 * `{ id: 'foo', module: '@game-hub/game-foo/module', client: '@game-hub/game-foo/client' }`.
 */
export interface GameEntry {
  /** Stable id — the `game_type` discriminator, matched by both the module and the client. */
  readonly id: string;
  /** Import specifier for the backend `GameModule` (default export), used by the generated registry. */
  readonly module: string;
  /** Import specifier for the UI `GameClient` (default export), used by the generated registry. */
  readonly client: string;
}

const games: readonly GameEntry[] = [
  { id: 'container', module: './container', client: './container' },
  { id: 'cantstop', module: './cantstop', client: './cantstop' },
  { id: 'stoneage', module: './stoneage', client: './stoneage' },
  { id: 'stpetersburg', module: './stpetersburg', client: './stpetersburg' },
];

export default games;
