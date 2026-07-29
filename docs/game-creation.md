# Adding a game — the package recipe

This is the complete, self-sufficient recipe for adding a game to Game Hub in the **package shape** that
all five current games use (`packages/games/<id>/`, four TS-source subpath exports over
`@game-hub/kernel`). Follow it top to bottom and the game coexists with the others, touching no shared
core. It is written to be executable as-is.

Read [`design-patterns.md`](./design-patterns.md) first — this recipe references its principles
(engine purity, the three seams, coordination state, redaction, injected randomness) rather than
re-explaining them. Adding a game is **additive**: implement the seams, register, done.

Throughout, `<id>` is the game id (lowercase, no spaces) — the engine folder name, the package suffix,
and the `game_type` discriminator, all the same string.

---

## 0. Prerequisites

- **The rulebook lives in `reference_materials/`** (gitignored — copyrighted PDFs stay local-only). ⚠️
  **Read the spec before implementing a rule** — rulebook page, not memory. Cite the page in a comment at
  every mechanic (`// pg. 9: Produce as many as you are able to`). Never implement a rule from memory or
  guess at one you could check.
- Decide the game's shape up front: seat bounds, whether it has **hidden information** (drives `viewFor`),
  and whether it needs **per-turn randomness** (dice/draws — drives `routes` + `ctx.rng`) or only
  **setup randomness** (a shuffle — drives `createGame({ rng })`).

---

## 1. Scaffold the package

Create `packages/games/<id>/` with these four files. Copy an existing game closest in shape (Saint
Petersburg is the routeless/hidden-info template; Can't Stop is the routes+dice+difficulty template;
Container is the everything template) and adjust.

### `package.json`

```jsonc
{
  "name": "@game-hub/game-<id>",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "license": "BSD-3-Clause",
  "exports": {
    "./engine": "./src/engine/index.ts",
    "./module": "./src/module/index.ts",
    "./client": "./src/client/index.ts",
    "./bot": "./src/bot/index.ts"     // omit if the game has no bot
  },
  "scripts": {
    "test": "vitest run --coverage",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@game-hub/kernel": "workspace:*"
    // + any third-party UI lib the client imports DIRECTLY (see the dep rules below)
  },
  "peerDependencies": {
    "react": "^19.0.0"              // for ./client
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@vitest/coverage-v8": "^3.2.4",
    "typescript": "^5.9.2",
    "vitest": "^3.2.4"
    // + "fastify": "^5.2.0"                              — ONLY if the module has routes.ts
    // + "better-sqlite3" + "@types/better-sqlite3"       — ONLY if the module opens its own table
  }
}
```

**Dependency rules (verified against the five games):**

- `@game-hub/kernel` is the **only** runtime dependency every game needs. No game may depend on
  `@game-hub/backend` or `@game-hub/ui` — that's a workspace cycle.
- **`fastify`** is a *type-only devDependency*, added **only if the module has a `routes.ts`** (the runtime
  instance is the host's; you import only its types). The routeless variant (Saint Petersburg) omits it.
- **`better-sqlite3` + `@types/better-sqlite3`** are devDependencies **only if the module opens its own
  table** to hold coordination state (Container's delivery-auction table binds the `Db` generic). The
  other four leave `Db` at `unknown`.
- **A third-party UI lib the client imports directly** is the package's own real `dependency` (Container's
  `lucide-react`) — it can't lean on `ui/node_modules` resolution. A client that reaches such libs only
  transitively through `@/components/ui/*` wrappers needs nothing extra.

### `tsconfig.json`

```jsonc
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["react"]                        // + "better-sqlite3" if the module binds Db
  },
  // The engine/module/bot subpaths depend only on @game-hub/kernel (+ Fastify/React/sqlite types), so
  // the package typechecks them itself. The ./client subpath reaches into the UI shell (@/lib/api, the
  // shared board components), so the UI HOST typechecks it — a TS-source game package can't fully
  // typecheck its own client without the shell's path aliases.
  "include": ["src/engine", "src/module", "src/bot", "vitest.config.ts"]
}
```

⚠️ **The include split is deliberate: the client is not in it.** The package builds engine/module/bot
standalone; the *client* is host-typechecked because it reaches the shell's `@/` alias (see §6).

### `vitest.config.ts`

Two **per-glob thresholds** — engine 100%, bot 90% — with the coverage excludes:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/bot/**/*.test.ts'],
    server: { deps: { inline: [/@game-hub\/kernel/] } }, // kernel ships TS source — transform it
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**/*.ts', 'src/bot/**/*.ts'],
      exclude: [
        'src/engine/**/tests/**',       // test files + helpers
        'src/engine/**/index.ts',       // barrels (re-exports only)
        'src/engine/core/types.ts',     // compile-time only
        'src/engine/actions/action.ts', // compile-time only (the Action union)
        'src/bot/**/tests/**',
        'src/bot/**/index.ts',
        'src/bot/types.ts',             // compile-time only
      ],
      thresholds: {
        'src/engine/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
        'src/bot/**': { statements: 90, branches: 90, functions: 90, lines: 90 },
      },
    },
  },
});
```

⚠️ Port your game's *actual* type-only/barrel excludes verbatim — the gate must not silently weaken. The
module and client are host bindings, tested by the backend/UI suites; they are not in this gate.

---

## 2. `./engine` — the pure rules core

Lay it out one folder per concern (see design-patterns §1 and CLAUDE.md → "Engine layout" precedent):

```
src/engine/
  index.ts            THE public API — the only thing ./module, ./bot, ./client import
  createGame.ts       deterministic setup (rng injected as a param if it shuffles)
  core/               constants.ts, types.ts, errors.ts (subclass the kernel GameError), index.ts
  internal/           shared helpers, incl. record.ts (the ONE place that bumps version + logs)
  actions/            one file per mechanic + action.ts (the Action union) + applyAction.ts + legalActions.ts
  tests/              one test file per mechanic + helpers.ts
```

Rules:

- **One mechanic = one file** in `actions/` + **one matching test file** in `tests/`. Reuse `internal/`
  helpers (DRY). Adding an action = a variant in `action.ts` + a mechanic file + an `applyAction` case +
  a `legalActions` branch + a public export in `index.ts` + a test file.
- **Purity is absolute** — no `Date`, no `Math.random`, no mutation. Randomness a *rule* consumes (dice,
  shuffles) comes in as **data**: model it as an action carrying the already-rolled values, or as a
  `createGame` input, so the state function is deterministic and the 100% gate is reachable.
- ⚠️ **Never bump `version` or append to the log outside `record()`.** Use the kernel `record()` /
  `makeSeating` helpers rather than re-implementing them.
- **The end state is the kernel `GameEndState<Score>` union** — intersect it into your state type
  (`… & GameEndState<PlayerScore>`) so the `active` arm carries no `results` and read sites narrow on
  `status`. A game with nothing to tabulate takes `WinnersEndState`.
- **`viewFor(state, viewer)` is an explicit per-game decision** — redact each non-viewer's secrets to
  `null`/hidden, revealing all at `status === 'ended'`. A game with no secrets makes it (nearly) a no-op —
  that's fine, but write it deliberately. ⚠️ Anything the engine logs is public (design-patterns §3): a
  hidden value is redacted in `record()`/`viewFor` or simply never logged, never hidden in the UI.
- Import siblings by **direct path** (`./roll`), cross-folder via the barrel (`../core`), the kernel by
  package specifier (`@game-hub/kernel`). Under `src/engine/tests/` and other subfolders, reach the engine
  as `../` / `../../` — not a package self-import.

---

## 3. `./module` — the backend seam

`src/module/` implements `GameModule<State, Action>`. Files: `index.ts` (the module object, default +
named export), `context.ts` (the bound context — below), `createGame.ts`, `parseAction.ts`, `errors.ts`
(the `GameError` → HTTP map), plus `routes.ts` / `botRunner.ts` / a coordination table as needed.

### `src/module/context.ts` — bind the generic host types

A package can't name the backend's concrete `ModuleContext`/`GameHub`/`BotRepository` (workspace cycle),
so bind the kernel's **structural** host types (design-patterns §7):

```ts
import type { FastifyInstance } from 'fastify'; // omit if no routes
import type {
  GameModule as KernelGameModule,
  ModuleBotSeats,
  ModuleContext as KernelModuleContext,
  ModuleHub,
} from '@game-hub/kernel';

export type ModuleContext = KernelModuleContext<unknown, ModuleHub, ModuleBotSeats>;
export type GameModule<S, A> = KernelGameModule<S, A, ModuleContext, FastifyInstance>;
```

- **Routeless variant:** omit the `fastify` import and leave `App` at its `unknown` default (contravariance
  makes that assignable to the backend registry's `FastifyInstance` slot since `routes` is absent).
- **Owns its own table:** bind the first generic to better-sqlite3 —
  `import type { Database } from 'better-sqlite3'; export type Db = Database;` then
  `KernelModuleContext<Db, ModuleHub, ModuleBotSeats>`.

### The module object (`index.ts`)

Implement the required members — `id`/`name`/`minPlayers`/`maxPlayers`, `colors`, `createGame`,
`applyAction`, `legalActions`, `viewFor`, `parseAction`, `summarize`, `versionOf`, `movesOf`, `mapError` —
each delegating to the engine. Then the optional hooks **only if the game needs them**:

- **`kernelContract`** — declare it: `import { KERNEL_CONTRACT_VERSION } from '@game-hub/kernel'` and set
  `kernelContract: KERNEL_CONTRACT_VERSION`. Never a literal — taken from the kernel the game compiled
  against, the number can't drift, and a game that ends up resolving a *different* kernel copy is caught by
  `GameRegistry.register` at boot instead of failing mid-game (Track D design doc §4). Technically optional
  (absent ⇒ contract 1) only while every game predates the field; write it in every new game.
- **`colors`** — an ordered palette of lowercase colour ids that is *the board's current seat tints in seat
  order* (palette-order default reproduces the existing look). Cover `maxPlayers`. Player colours, not any
  game-piece colour. The platform does all the picking/uniqueness/persistence/wiring; you just name ids.
- **`botDifficulties`** — declare tier ids only if the game offers them (Can't Stop); omit otherwise.
- **`parseAction`** owns *all* action validation and **accepts only actions a client may send.** A
  server-only action (a dice roll) is refused here and built by a route from `ctx.rng`. ⚠️ Don't rely on
  Fastify to validate the action — it validates only `{ playerId, action: object }`.
- **`pendingStep`** — return a 409 for an action currently owned by a flow of yours (Container refuses
  `DELIVER` while an auction is pending).
- **`routes(app, ctx)`** — a game's own endpoints, declared *relative* to `/games/:id/<id>/`. **Per-turn
  randomness:** a route rolls from `ctx.rng` and applies a pure engine action carrying the result — the
  client asks but can't choose the dice. ⚠️ Never reach for `Math.random` in a module. If a route replies
  with game state, include `colors: ctx.colorsFor(id, state)` so its shape matches the core payload, and
  project through `viewFor` with the caller's viewer.
- **`onStateChanged(state, ctx)`** — push a side-channel of your own (Container's projected auction) via
  `ctx.hub.broadcastEach`.
- **`createBotDriver(ctx)`** — wire the bot (§5). Omit for a game with no bots.
- **`schemaVersion` / `migrate`** — only when a shipped engine's serialized shape changes later (§ Persistence
  in design-patterns). Start with neither (implicitly v1).

**Coordination state goes in its own table, not the engine** (design-patterns §2). Open it off `ctx.db`
the way `lobbies.ts`/`bots.ts` do.

**Test-visibility:** a package exposes only its four barrels (no deep imports). If a host test needs a
module internal (Saint Petersburg's `mapStPetersburgError`), re-export it from the `./module` barrel.

---

## 4. `./client` — the UI seam

`src/client/` implements `GameClient`. Files: `index.ts` (the client object, default + named export),
`types.ts` (bind the transport DTOs — below), `Board.tsx`, `api.ts`, panels/art as needed.

### `src/client/types.ts` — bind the transport DTOs

```ts
import type { BoardProps as KernelBoardProps, GameClient as KernelGameClient } from '@game-hub/kernel/client';
import type { GameMessage, GamePayload } from '@/lib/api';

export type GameClient<S> = KernelGameClient<S, GamePayload<S>, GameMessage>;
export type BoardProps<S> = KernelBoardProps<S, GamePayload<S>, GameMessage>;
```

### The client object

- **`Board` is lazy** (`lazy(() => import('./Board'))`) — non-negotiable; it carries the engine + art and
  the landing must not ship it. **`Status`** (optional) is cheap and **non-lazy** — it renders before the
  board chunk lands. **`blurb`** (one line) + **`rules`** (a few bullets) feed the landing.
- **`api.ts` pins the types back:** `lib/api.ts` is generic in `S`; call `api.getGame<GameView>(…)` so the
  board is fully typed. Put the game's own endpoints here (they call `/games/:id/<id>/…`). ⚠️ Don't widen
  the board to `unknown` — pass the type parameter.
- **Map `BoardProps.colors`** (playerId → palette id) to your own tint system, falling back to seat index
  when a colour is missing. **Gate every action affordance on `canDrive`** (via the shared `seatIdentity`).
  Pass `viewer` to any call returning projected state.
- **Shared chrome via `@/…`:** render the end screen with the shared `@/components/GameOver` frame; use
  `@/components/TurnBanner`, `@/components/ActivityFeed`, `@/components/seatIdentity`. A board keeps its own
  banner wording and `describe(entry)` closure; the frame is shared. ⚠️ The client couples to `ui/src` via
  the `@` alias at build time — an accepted in-workspace coupling (design-doc contract gap #1), which is
  also why the UI host typechecks the client (§1).

---

## 5. `./bot` — the AI (optional)

`src/bot/` over the kernel's `@game-hub/kernel/bot` helpers. See design-patterns §6 for the principles.

- **Decide from the redacted view:** `decide(viewFor(state, botId), botId)` — never a `GameState`. Use
  `assertBotTurn` for the ended/not-your-turn preamble.
- **⚠️ Injected randomness:** the bot can't roll dice or see sealed opponent bids — the caller supplies
  them (`rollDice`/`collectBids`); `decide` throws a `BotError` if not. Self-play seeds it; the runner
  fills from `ctx.rng`.
- **⚠️ Score long chains against the goal, not the hop** — a greedy bot can't see a multi-action payoff and
  will never start one (Container's ships never left port; Stone Age hunted food forever).
- **`playSelfPlay` is the real test** — thousands of live engine actions; any illegal action throws. Keep
  it green at every seat count.
- A `benchmark` export (over `runBenchmark`/`wilsonInterval`/`mulberry32`) lets `packages/bench/` measure
  the bot's win rate; register it there if you want `pnpm bench` to cover the game.
- Bot files under `src/bot/tests/` reach the engine as `../../engine`.

---

## 6. Host wiring checklist

Verified against how all five games are wired. For a game `<id>`:

1. **`games.config.ts`** — add one entry (config order = registration order):
   ```ts
   { id: '<id>', module: '@game-hub/game-<id>/module', client: '@game-hub/game-<id>/client' },
   ```
2. **`pnpm install`** — link the new workspace package (`packages/games/*` is already a workspace glob in
   `pnpm-workspace.yaml`; no edit there).
3. **`pnpm generate`** — regenerates `backend/src/games/index.generated.ts` and
   `ui/src/games/registry.generated.ts`. Both must regenerate cleanly (the CI freshness check diffs them).
4. **`backend/package.json`** — add `"@game-hub/game-<id>": "workspace:*"` to `dependencies`.
5. **`ui/package.json`** — add `"@game-hub/game-<id>": "workspace:*"` to `dependencies`.
6. **`ui/vite.config.ts`** — add one alias so Vite consumes the client as TS source:
   ```ts
   '@game-hub/game-<id>/client': fileURLToPath(
     new URL('../packages/games/<id>/src/client/index.ts', import.meta.url),
   ),
   ```
   Only `/client` is needed — the client imports its own engine via a relative path within the package.
7. **`ui/tsconfig.json`** — add `"../packages/games/<id>/src/client"` to `include` (so the UI host
   typechecks the client — §1).
8. **`packages/bench/package.json`** — add the game as a `workspace:*` dependency **if** you registered a
   `benchmark` in the aggregator.
9. **`pnpm install`** again to relink the new host deps.

That's the whole surface: **one `games.config.ts` entry + `pnpm generate` + one dep/alias/include line per
host.** The `architecture.spec.ts` forbids any shell file importing `@game-hub/game-*` (or the historical
`@game-hub/engine`) — only the generated registry may name a game.

---

## 7. Testing expectations

- **Engine 100%** — every rule and every rejection path (the `src/engine/**` glob threshold). Tests ship
  with the code.
- **Bot 90%** + self-play at every seat count (the `src/bot/**` glob threshold).
- **Backend REST coexistence suite** — play the game to a real end over REST (seed `AppOptions.rng` for
  deterministic rolls) *and* assert it coexists with the other games (the honest multi-game test — a stub
  counter game already lives in `module-seam.test.ts`; keep it green).
- **e2e spec** — `ui/e2e/<id>.spec.ts` picks the game from the landing and plays a turn; keep testids
  stable (Playwright depends on them) and don't change existing baselines. The landing picker activates
  automatically once two games are registered.
- **Architecture-spec compliance** — no shell file imports the game; only `registry.ts` names it; the
  folder is declared in `games.config.ts`.

---

## 8. Final verification checklist

Run all of these; each must be green before the game is done:

```bash
pnpm generate && git diff --exit-code    # generated registries fresh & Prettier-clean
pnpm typecheck                           # strict, all packages (incl. the UI-host client typecheck)
pnpm -r test                             # kernel + every game package's engine/bot gates + backend
pnpm --filter @game-hub/game-<id> test   # this game's engine 100% / bot 90% gates in isolation
pnpm lint
pnpm format:check                        # note: *.md is Prettier-ignored — hand-wrap docs
pnpm --filter @game-hub/ui exec playwright test <id> architecture   # the game's e2e + the seam guard
pnpm bench                               # optional — if you registered a benchmark
```

Cross-reference [`design-patterns.md`](./design-patterns.md) whenever a "why" is unclear — this recipe is
the *how*; that doc is the *why*.
