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
 * and expected to expose the module/client as a **default export**. Since Track D, **every game is its
 * own in-workspace package** (`@game-hub/game-<id>`), so both specifiers are package subpaths —
 * `{ id: 'foo', module: '@game-hub/game-foo/module', client: '@game-hub/game-foo/client' }`. (The shape
 * once also accepted a relative path for a game whose folders lived inside the backend/UI; none remain,
 * but the codegen still handles either form, so an out-of-repo package later is the same entry.)
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
  // Container — Track D legacy-migration (phase 5): the heaviest game (delivery-auction routes over its
  // own SQLite table, pendingStep, onStateChanged push, a bot runner) moved out of the shared
  // engine/backend/UI folders into its own in-workspace package (`@game-hub/game-container`), following the
  // RR precedent and the Can't Stop / Stone Age / Saint Petersburg phases. Registration order unchanged —
  // Container stays first.
  {
    id: 'container',
    module: '@game-hub/game-container/module',
    client: '@game-hub/game-container/client',
  },
  // Can't Stop — the Track D pilot **retrofit** (legacy-migration phase 2): the first of the four
  // legacy games moved out of the shared engine/backend/UI folders into its own in-workspace package
  // (`@game-hub/game-cantstop`), following the Russian Railroads precedent. Same GameEntry shape,
  // package specifiers instead of relative paths.
  {
    id: 'cantstop',
    module: '@game-hub/game-cantstop/module',
    client: '@game-hub/game-cantstop/client',
  },
  // Stone Age — Track D legacy-migration (phase 3): moved out of the shared engine/backend/UI folders
  // into its own in-workspace package (`@game-hub/game-stoneage`), following the RR precedent and the
  // Can't Stop pilot. Same GameEntry shape, package specifiers instead of relative paths.
  {
    id: 'stoneage',
    module: '@game-hub/game-stoneage/module',
    client: '@game-hub/game-stoneage/client',
  },
  // Saint Petersburg — Track D legacy-migration (phase 4): moved out of the shared engine/backend/UI
  // folders into its own in-workspace package (`@game-hub/game-stpetersburg`), following the RR precedent
  // and the Can't Stop / Stone Age phases. Same GameEntry shape, package specifiers instead of relative
  // paths. The routeless variant — its module has no `routes.ts`.
  {
    id: 'stpetersburg',
    module: '@game-hub/game-stpetersburg/module',
    client: '@game-hub/game-stpetersburg/client',
  },
  // Russian Railroads — the Track D pilot: the first game hosted from its own in-workspace package
  // (`@game-hub/game-russianrailroads`) rather than sibling folders in the backend/UI. Same GameEntry
  // shape, package specifiers instead of relative paths.
  {
    id: 'russianrailroads',
    module: '@game-hub/game-russianrailroads/module',
    client: '@game-hub/game-russianrailroads/client',
  },
];

export default games;
