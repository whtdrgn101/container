# Building a game for Game Hub — the standalone-repo recipe

This is the complete, self-sufficient guide to building a new game for Game Hub. As of 2026-07-31 there is
**one way to build a game and it is out-of-repo**: a game is its own repository, published to npm as
`@game-hub/game-<id>`, and hosted here as an ordinary installed dependency resolving to compiled `dist/`.
All games — the five originally in-workspace, Labyrinth (born external), and Argute (born from the template) — live this way
(`whtdrgn101/game-<id>`), and nothing lives under `packages/games/` anymore.

You are the audience whether you work for this project or are a third party: a game builds against the
**published** `@game-hub/kernel` and `@game-hub/ui-kit` and never against this repo's filesystem. If the
published contract has a hole, your CI is where it shows up — which is the whole point of the shape.

> **Start from the template.** [`whtdrgn101/game-template`](https://github.com/whtdrgn101/game-template) is a
> complete, working, minimal game (Nim) in exactly this shape, with every gate green. `gh repo create
> <you>/game-<id> --template whtdrgn101/game-template` (or copy it) and do its rename checklist. This guide
> explains the _why_ behind each file the template ships; read them together.

Read [`design-patterns.md`](./design-patterns.md) first for the platform's principles (engine purity, the
three seams, coordination state, redaction, injected randomness); this guide references them rather than
re-explaining. Throughout, `<id>` is the game id — lowercase, no spaces — used as the engine folder name,
the package suffix, the module's `id`, and the `game_type` discriminator, all the same string.

---

## 1. The contract — four subpath exports over one kernel

A game is **one npm package** with **four subpath exports**, one per seam:

```
@game-hub/game-<id>
├── ./engine   pure rules — deterministic, injected randomness, 100% test gate. Imports only @game-hub/kernel.
├── ./module   the backend GameModule — server seam. Imports ./engine (+ kernel).
├── ./client   the UI GameClient — a lazy board. Imports ./engine, @game-hub/kernel/client, @game-hub/ui-kit.
└── ./bot      optional AI — pure policy, 90% test gate. Imports ./engine (+ @game-hub/kernel/bot).
```

The **only** platform dependencies a game may have are `@game-hub/kernel` (contracts + primitives) and
`@game-hub/ui-kit` (the shared board chrome + the game-facing REST helpers). A game **may not** depend on
the hub's `backend` or `ui` — that is an unpublishable package, and the seam rule below forbids it.

**`@game-hub/kernel`'s major version _is_ the host↔game contract version.** It exports
`KERNEL_CONTRACT_VERSION` (= 1 today); every module declares `kernelContract: KERNEL_CONTRACT_VERSION`, and
the host's registry boot-crashes on a mismatch. Additive optional hooks are a **minor** bump; a changed
required member is a **major**. See §6 for what that means when you publish.

### `./engine` — pure rules, injected randomness

The authoritative rules, as a pure `state + action → state` library. **Purity is absolute**: no `Date`, no
`Math.random`, no mutation. Randomness is **injected** — at setup through `createGame({ rng })` (a shuffle),
or per action through a module route drawing from `ctx.rng` (dice), never reached for. Randomness a _rule_
consumes comes in as data: model a die roll as an action carrying the already-rolled values, so the state
function stays deterministic and the 100% gate is reachable.

Lay it out one folder per concern (the template and every hub game do this):

```
src/engine/
  index.ts            THE public API — the ONLY thing ./module, ./client, ./bot import from the engine
  createGame.ts       deterministic setup (rng injected as a param if it shuffles)
  core/               constants.ts, types.ts (compile-time only), errors.ts (a GameError subclass), index.ts
  internal/           shared helpers, incl. the kernel record()/makeSeating bindings
  actions/            one file per mechanic + action.ts (the Action union) + applyAction.ts + legalActions.ts
  view.ts             viewFor + the view type (redaction — see below)
  tests/              one file per mechanic + helpers.ts
```

- **One mechanic = one file** in `actions/` + one matching test in `tests/`. Adding an action is a variant
  in `action.ts`, a mechanic file, an `applyAction` case, a `legalActions` branch, a public export, a test.
- **Setup randomness comes from the kernel's `.` barrel**: `shuffle(items, rng?)` (Fisher–Yates, new array;
  omitting `rng` keeps order — how a rules test deals a _known_ deck) and `mulberry32(seed)` for a seeded
  generator in `tests/helpers.ts`. Both are on `@game-hub/kernel` since 1.2.0 — don't reach into
  `@game-hub/kernel/bot` from an engine test, and don't re-implement either.
- **⚠️ Never bump `version` or append to the log outside `record()`** — the kernel's `record()` is the one
  place both move, and everything it logs is public (see below). Bind the kernel's `makeSeating` with your
  own `GameError` subclass (`internal/players.ts`) so a `PLAYER_NOT_FOUND` stays `instanceof` your class.
- **The end state is the kernel's union.** Intersect `GameEndState<Score>` (a game that tabulates) or
  `WinnersEndState` (a winner and nothing else — Nim, Can't Stop) into your state type, so `ended` and
  `results`/`winnerIds` can never disagree; read sites narrow on `status`.

### `viewFor` redaction — an explicit per-game decision

`viewFor(state, viewer)` projects state for one client (`viewer` is one seat, several in hotseat, or `null`
for a spectator). **It is the only thing standing between a client and another player's secrets**, so it is
an explicit decision every game writes, in the _engine_ (under the 100% gate) — not the module — because
what a player may see is as much a rule as what they may do, and because `./client`/`./bot` must name the
view type without importing `./module`.

- A game with **hidden information** (Saint Petersburg's hand, Labyrinth's face-down stack) rebuilds the
  view **field by field**, redacting each non-viewer's secrets to `null`/a bare count, and reveals
  everything once `status === 'ended'`. ⚠️ **Never spread the state into a view** — a spread ships every
  secret, and a field added later rides along silently.
- A game with **no secrets** (Nim, Can't Stop) makes `viewFor` (nearly) the identity — but write it
  deliberately, aliasing the view type (`NimView = NimState`) so the seam is visible and the day a secret
  appears, the view diverges and the client follows _it_, not the un-redacted state.
- **⚠️ Everything logged is public** (design-patterns §3). Anything the engine records is on the wire
  regardless of `viewFor`, so a genuine secret must be redacted in the log entry _or never logged_ —
  Container never records a _losing_ bid at all. Redacting only in the UI is a leak.

### Typed errors

Every rejection is a typed `GameError` subclass whose `code` is drawn from your own union
(`NimErrorCode`, `LabyrinthErrorCode`, …), so a thrown code is always one the game declares. Split codes
along the platform's house shape — **404** (a named thing doesn't exist), **400** (the request could never
be valid — a bad seat count, a malformed payload; `parseAction` normally catches these first), **409** (a
well-formed move this state refuses — out of turn, illegal now). The module's `mapError` turns each code
into a status through a **total** record, so a code added later fails to compile until its status is
decided.

### Coverage discipline

- **Engine 100%** — every rule and every rejection path, enforced by a `src/engine/**` per-glob gate. Tests
  ship with the code; a feature without tests isn't finished.
- **Bot 90%** — heuristics get retuned, so a 100% bar on judgement calls buys churn, not correctness.
- The **module** and **client** are host bindings — tested (their tests still run), but not gated here; the
  hub's backend/UI suites are what finally exercise them once the game is registered.

---

## 2. Repo scaffold

Take all of this from the template; the notes below say what each file is _for_ and what must not drift.

### `package.json`

The shape that makes one package resolve two ways — TS source in your workspace, `dist/` when a host
installs it:

```jsonc
{
  "name": "@game-hub/game-<id>",
  "version": "0.1.0",
  "type": "module",
  "license": "BSD-3-Clause",
  "engines": { "node": ">=22" },
  "packageManager": "pnpm@11.13.1",
  "files": ["dist"],
  // Dev resolution: the four subpaths point at TS SOURCE, so your own tests/typecheck read source directly.
  "exports": {
    "./engine": "./src/engine/index.ts",
    "./module": "./src/module/index.ts",
    "./client": "./src/client/index.ts",
    "./bot": "./src/bot/index.ts",
    "./package.json": "./package.json"
  },
  // Publish resolution (a pnpm feature applied at pack/publish): the SAME subpaths rewritten to dist/,
  // `types` first. This is what a host installs — one package, two resolutions, no host-side shim.
  "publishConfig": {
    "access": "public",
    "exports": {
      "./engine": { "types": "./dist/engine/index.d.ts", "default": "./dist/engine/index.js" },
      "./module": { "types": "./dist/module/index.d.ts", "default": "./dist/module/index.js" },
      "./client": { "types": "./dist/client/index.d.ts", "default": "./dist/client/index.js" },
      "./bot":    { "types": "./dist/bot/index.d.ts",    "default": "./dist/bot/index.js" },
      "./package.json": "./package.json"
    }
  },
  "scripts": {
    "test": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "build": "… && tsc -p tsconfig.build.json",
    "prepack": "pnpm build",            // so `pack`/`publish` always builds dist first
    "pack:smoke": "node scripts/pack-smoke.mjs",
    "lint": "eslint .",
    "format:check": "prettier --check ."
  },
  // ⚠️ PEER + DEV, not `dependencies`. The host provides exactly ONE copy of each; the matching
  // devDependency (same version) lets your repo build and test standalone.
  "peerDependencies": {
    "@game-hub/kernel": "^1.2.0",
    "@game-hub/ui-kit": "^1.0.0",
    "react": "^19.0.0"
  },
  "peerDependenciesMeta": {
    "@game-hub/ui-kit": { "optional": true },   // only ./client needs it — a ./module-only host must not owe it
    "react": { "optional": true }
  },
  "devDependencies": { "@game-hub/kernel": "^1.2.0", "@game-hub/ui-kit": "^1.0.0", "react": "^19.0.0", "…": "…" }
}
```

**Why peer + dev and not a plain `dependency`** (this is not a style preference): a plain dependency lets
pnpm/npm satisfy your game with a **nested** second copy of the kernel/ui-kit under your package's own
`node_modules`, and two copies break things that look nothing like a dependency problem —

- **`instanceof` stops working.** A `GameError` from your copy of the kernel is not `instanceof` the host's,
  so the module's `mapError` returns `null` and a clean 400 becomes a 500.
- **React double-loads.** A second React through a duplicated ui-kit means two reconcilers — hooks throw
  inside the shared chrome, and `configureTransport`/`RematchContext` module state silently forks.
- **Tailwind loses the chrome's styles.** The host scans `node_modules/@game-hub`; a _nested_ duplicate is
  outside that glob, so a `Button` from it renders unstyled.

`peerDependencies` says "the host provides one copy"; the dev entry is what builds you standalone. Add
`fastify` as a **type-only devDependency** only if your module has a `routes.ts`; add `better-sqlite3` +
its types only if the module opens its own coordination table. A third-party UI lib the client imports
_directly_ (Container's `lucide-react`) is the package's own real `dependency`.

### `tsconfig.json` / `tsconfig.build.json`

A standalone repo has no `tsconfig.base.json` to extend, so `tsconfig.json` **inlines** the hub's base
options verbatim (`target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict`,
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `declaration`, `sourceMap`, …) plus the three a `./client`
adds (`jsx: react-jsx`, DOM libs, `types: ["react"]`), and `include: ["src", "vitest.config.ts"]`. Keep it
byte-compatible with the hub's base and re-check when the platform tightens a flag.

`tsconfig.build.json` extends it and _emits_ (`outDir: dist`, `noEmit: false`, `include: ["src"]`,
`exclude: ["src/**/tests/**"]`). ⚠️ Two properties it must not lose: **`module: ESNext` is inherited, not
overridden** (it keeps the client's `lazy(() => import('./Board.js'))` a real dynamic `import()` the host
code-splits on — CJS would un-split it), and it pairs `sourceMap` with **`inlineSources`** because the
tarball ships `dist`, not `src` (a plain map points at `../src/**` files a consumer doesn't have, and every
bundler warns). `declarationMap` stays **off** for the same reason.

### `vitest.config.ts` — the two per-glob gates

```ts
coverage: {
  include: ['src/engine/**/*.ts', 'src/bot/**/*.ts'],
  exclude: [
    'src/engine/**/tests/**', 'src/engine/**/index.ts',   // test files + barrels
    'src/engine/core/types.ts', 'src/engine/actions/action.ts',  // compile-time only
    'src/bot/**/tests/**', 'src/bot/**/index.ts', 'src/bot/types.ts',
  ],
  thresholds: {
    'src/engine/**': { statements: 100, branches: 100, functions: 100, lines: 100 },
    'src/bot/**':    { statements: 90,  branches: 90,  functions: 90,  lines: 90 },
  },
}
```

⚠️ Port your game's _actual_ type-only/barrel excludes verbatim — the gate must not silently weaken. Run
the module/client tests too (they're in `include` for the run, out of `coverage.include`). ⚠️ A **client**
test opts into a DOM with a `// @vitest-environment jsdom` docblock on line 1 — one line in the file that
needs it, leaving the per-glob gates untouched (a per-glob `environment` is deprecated in Vitest 3).

### The rest

`eslint.config.js` (flat config: syntactic hazards + React/hooks scoped to `src/client/**`; **not** a
second typechecker — `recommendedTypeChecked` is deliberately off), `.prettierrc.json` (single quotes,
semicolons, trailing commas, width 120; `*.md` ignored — hand-wrap docs), `.npmrc` (pin
`registry.npmjs.org` so `@game-hub/*` can never resolve to a local link), `.nvmrc` (22),
`pnpm-workspace.yaml` (one package, not a workspace — it exists only for pnpm's settings;
`autoInstallPeers: false` so a missing peer surfaces; a `minimumReleaseAgeExclude` entry if you bump to a
just-published `@game-hub` version), `LICENSE`, `scripts/pack-smoke.mjs` (§3, §7), and
`.github/workflows/ci.yml` (install `--frozen-lockfile` from the public registry → typecheck → lint →
format:check → test → **pack:smoke**, on a runner with no access to this repo).

---

## 3. The ⚠️ hazards — each with the story of what it broke

These are not style notes. Each is something that actually broke, invisibly, because a game repo's own
checks all read TS source while a host reads `dist/`.

### 3a. Explicit `.js` extensions on every relative specifier in shipped `src`

Write `from '../engine/index.js'`, `from './take.js'`, `import('./Board.js')` — **including folder barrels**
(`'../core/index.js'`). `tsc` emits relative specifiers **verbatim**, and Node ESM does neither extension
nor directory resolution, so an extensionless `from '../engine'` produces a tarball that throws
`ERR_MODULE_NOT_FOUND` on a host's **first import** — while every check in your repo stays green, because
TS, Vite, Vitest and esbuild all do the `.js`→`.ts` mapping in-workspace. One spelling (`.js`) resolves to
`.ts` source in your repo _and_ to the emitted `.js` in the tarball. This is the platform's D2a lesson,
re-learned game-side at D2d. Test files (excluded from the build) keep the extensionless style.
**`pack:smoke` is the honest check** — do not let anyone "tidy" the extensions away.

### 3b. No bundler constants (`import.meta.env`) in package code — `configureTransport` instead

The ui-kit's transport helpers once derived their base URL from Vite's `import.meta.env.PROD` (dev proxies
`/api`; prod serves at the origin root). That is a _bundler_ constant — baked into a published `dist/`, it
is fragile at best and wrong at worst for an installed consumer. So a game **never reads `import.meta.env`
in a shipped file, and never hard-codes an API prefix**: the **host** calls `configureTransport({ baseUrl })`
once at boot, and every game builds URLs through the ui-kit's `apiUrl('/games/:id/<id>/…')`. That injection
is why the same published package works behind the hub's dev proxy and at an origin root. (This is also why
the ui-kit is duplication-sensitive — see 3c/§2: a second copy forks that module-level state silently.)

### 3c. Tailwind classes ship in source; the package ships **no CSS**

Your board styles itself with Tailwind utility classes, in your source only. Tailwind v4's automatic content
detection **stops at `node_modules`**, so a host must scan the installed package with an explicit `@source`
(the hub's `ui/src/index.css` carries `@source '../node_modules/@game-hub'`, which follows pnpm's symlink
into `dist/` and compiles your classes — measured byte-for-byte at D2d, no glob change needed). Style with
the host's **semantic tokens** (`bg-card`, `text-muted-foreground`, `border-border`), not raw palette
colours, so a board inherits the host's light/dark theme instead of fighting it. Shipping compiled CSS
instead would freeze the theme at _package_ build time and fight the cascade — the decision (design-patterns
§2 / Track D §4b) is explicit `@source`, no shipped CSS.

### 3d. Don't import the hub shell

A `./client` may import exactly two platform packages — `@game-hub/kernel/client` and `@game-hub/ui-kit` —
and **nothing from `ui/src`**, ever. In-workspace the shell's `@/` alias resolves fine, so a stray
`import { cn } from '@/lib/utils'` typechecks and unit-tests and even builds green while the package is
quietly unpublishable; the breakage only shows on install. The hub's `architecture.spec.ts` enforces the
shell side; in a standalone repo such an import _cannot resolve at all_ (no alias, no `ui/` tree), so your
typecheck/build/`pack:smoke` enforce it structurally — which is exactly why the four-subpath contract makes
a game installable.

### 3e. Keep the engine pure

No `Date`, no `Math.random`, no mutation, no I/O in `./engine` — or replay, reproducible tests and the 100%
gate all die. A **module** must not reach for `Math.random` either: per-turn randomness comes from
`ctx.rng` inside a route. This is the discipline that lets a seeded generator drive every test and every
bench.

---

## 4. The standardized `./client` export surface

Prescribe the **full** surface — `src/client/index.ts` exports the client object as **default AND named**,
plus the two types a host and your own tests need to name: **`BoardProps`** and the game's **payload type**.
The template (and Labyrinth) do this; the five originally-in-workspace games under-export it today and will
be aligned to match — so build a new game to the full surface:

```ts
export const nimClient: GameClient<NimView> = { id, name, blurb, rules, Board: lazy(() => import('./Board.js')), Status };
export default nimClient; // the generated registry imports the default; nimClient stays a named export too
// ── the standardized surface ─────────────────────────────────────────────────
export type { BoardProps, GameClient } from './types.js';
export { act, fetchGame, GAME_TYPE } from './api.js';
export type { NimPayload, NimView } from './api.js';    // ← the game's PAYLOAD type, named from here
```

Why: a host binds a board as `ComponentType<BoardProps<View>>` and reads a `GamePayload<View>` off the
wire; both should be nameable from the one `./client` subpath without reaching into `./api`. The board
object itself is **lazy** (`Board: lazy(() => import('./Board.js'))`) — non-negotiable, so a games room
doesn't ship your board (and the engine slice it pulls) to someone who only opened the landing; `Status` is
cheap and **non-lazy**. `blurb` + `rules` feed the landing. In `client/types.ts` bind the DTOs once —
`GameClient<S> = KernelGameClient<S, GamePayload<S>, GameMessage>` and the matching `BoardProps<S>` — so
every board works in a single type argument. In the board, map `BoardProps.colors` (playerId → palette id)
to your tints (fall back to seat index), gate every affordance on `canDrive` (from the shared
`seatIdentity`), and render the end screen with the ui-kit's `GameOver`.

---

## 5. Rulebook discipline

**Read the spec before implementing a rule — the rulebook page, not memory — and cite the page in a comment
at every mechanic** (`// pg. 9: produce as many as you are able to`). A wrong rule that passes its tests is
worse than a missing feature, because the tests enshrine the mistake.

The rulebook PDF is **copyrighted**: keep it **local and gitignored** under `reference_materials/`. Commit a
`reference_materials/README.md` documenting the pattern and where to obtain the book (a `.gitignore` that
ignores `reference_materials/*` but keeps `!reference_materials/README.md`), and record the source there —
never paste the rules text in. Game _mechanics_ aren't copyrightable; the book's _text and illustrations_
are, so ship none of them: any board art is drawn fresh, from the plain word, not traced. (The template's
game, Nim, is a folk game with no protectable rulebook — its `reference_materials/README.md` says so and
keeps the pattern visible for the game you build.)

---

## 6. Publishing, and hosting the game

### Publish the package

```bash
pnpm pack:smoke          # prove the tarball loads before you publish it (§7)
npm publish              # publishConfig already sets access: public and rewrites exports → dist/
```

`prepack` builds `dist/` first, so `publish` can never ship stale output. **Semver:** a game's own versions
are ordinary (`0.1.0`, `0.2.0`, …); the number that carries contract meaning is the **kernel's** — its
_major_ is the host↔game contract version, so bump your peer range only within a major you still satisfy,
and if you move to a kernel major you are migrating to a new contract. Declare
`kernelContract: KERNEL_CONTRACT_VERSION` (imported, never a literal) so a game that resolves the wrong
kernel copy is caught at registration, not mid-game.

### Host it in the hub

Adding a published game here is **less** than the historical in-workspace shape, not more — a dist consumer
is just a dependency. In full:

1. `"@game-hub/game-<id>": "^0.1.0"` in **both** `backend/package.json` and `ui/package.json`.
2. One `games.config.ts` entry (config order = registration order):
   ```ts
   { id: '<id>', module: '@game-hub/game-<id>/module', client: '@game-hub/game-<id>/client' },
   ```
3. `pnpm generate` — regenerates the two checked-in registries (CI freshness-checks the diff).
4. `pnpm install`.

That is **all**: two dependency lines + one config entry + `pnpm generate`. **No** Vite alias, **no**
`tsconfig` include, **no** vitest inline entry — those were in-workspace shims and an installed game needs
none (it resolves out of `node_modules`, and its `./client` binds `@game-hub/kernel/client`, never the
shell's `@/`). If you find yourself adding an alias or include for an external game, stop — it means the
package is reaching into this repo, the one thing the contract forbids.

Two host-level settings make installed games work and are **already in place** — do not revert them:
`linkWorkspacePackages: true` (`pnpm-workspace.yaml`) resolves the game's kernel/ui-kit peers to the single
workspace copies instead of registry duplicates; `optimizeDeps.exclude: ['@game-hub/kernel',
'@game-hub/ui-kit']` (`ui/vite.config.ts`) stops Vite's dev pre-bundler inlining a second ui-kit copy into
the installed game (which forks the injected transport + React context — dev-server only, but silent). One
subtlety survives: `backend/vitest.config.ts` still inlines `/@game-hub\/(kernel|game-)/` because each
game's `dist` imports the workspace TS-source kernel — a native-external load would drag `.js` specifiers
through Node, which does no `.js`→`.ts` mapping and throws. Keep the inline entry.

---

## 7. Final verification checklist

In the **game's own repo**, each must be green before you publish:

```bash
pnpm typecheck                 # strict, all four subpaths (a package checks its own client)
pnpm test                      # engine 100% + bot 90% gates, and the module/client tests
pnpm lint                      # ESLint 9 flat config — real hazards, not a second typecheck
pnpm format:check              # Prettier (*.md hand-wrapped, Prettier-ignored)
pnpm build                     # tsc → dist/ (what publishConfig points at)
pnpm pack:smoke                # the honest check ↓
```

**`pack:smoke` is the only check that runs against `dist/` rather than source**, and it is what catches 3a:
it packs the tarball, installs it **plus its declared peers from the public registry** into a throwaway
project outside the repo, drives a real game through all four subpaths under plain `node` (create → parse →
apply → redact, the board still `React.lazy`, the lazy `Board.js` actually in the tarball, zero runtime
`dependencies`), and typechecks a consumer against the shipped `.d.ts` under **`nodenext`** resolution (the
strictest mode — it honours `exports` exactly as Node does and rejects extensionless specifiers in the
`.d.ts`). Green there ⇒ a `bundler`-resolution host is safe by construction.

Then **host-side**, after publishing and wiring it in (§6):

```bash
pnpm install && pnpm generate && git diff --exit-code   # registries fresh & clean
pnpm typecheck                                           # the UI host typechecks the client binding too
pnpm test:backend                                        # the game coexists in the core (module-seam stays green)
pnpm --filter @game-hub/ui exec playwright test <id>     # the game's e2e smoke: pick it, play a turn
```

Cross-reference [`design-patterns.md`](./design-patterns.md) whenever a "why" is unclear — this guide is the
_how_; that doc is the _why_ — and the [template repo](https://github.com/whtdrgn101/game-template) whenever
you want to see a file in full.
