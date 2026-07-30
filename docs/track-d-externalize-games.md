# Track D — Externalize games (design doc)

**Status: ✅ COMPLETE (2026-07-30). D2d delivered the thing the whole track existed to prove: Labyrinth
— built in its own repository, against published `@game-hub/kernel` + `@game-hub/ui-kit`, consumed here
as an installed package resolving to compiled `dist/` — is the hub's playable sixth game, in the
production Docker image.** The remaining step is bookkeeping, not architecture: `npm publish` the game
so `vendor/` can become a version range (see "Delivered in D2d" below). Slices D2a–D2d and the kickoff
decisions (public npm under the `game-hub` org — resolving §8 Q4 — a public
`whtdrgn101/game-labyrinth` repo, per-game e2e out of contract per §8 Q3) live in
[`game-labyrinth-kickoff.md`](./game-labyrinth-kickoff.md). Game 5 (Russian
Railroads) arrived *as* the Track D pilot — built as the first **in-workspace game package**
(`packages/games/russianrailroads`, the §3 four-subpath shape) — and then **all four legacy games were
migrated onto the same shape** and `@game-hub/engine`/`@game-hub/bot` retired (the working plan +
findings: [`track-d-legacy-migration.md`](./track-d-legacy-migration.md)). So **every game now lives in
its own `@game-hub/game-<id>` package** over a peer `@game-hub/kernel`; the kernel, the two hosts, and the
build-time registry codegen off `games.config.ts` all shipped as designed. The current shape is documented
for builders in [`design-patterns.md`](./design-patterns.md) and [`game-creation.md`](./game-creation.md).

What the migration resolved from the two gaps below (§D1 findings):

- **Contract gap #2 (the bound `ModuleContext`) — closed structurally.** The kernel gained minimal
  *structural* host interfaces (`ModuleHub`, `ModuleBotSeats`) next to `ModuleContext`; a game package
  binds `ModuleContext<Db, ModuleHub, ModuleBotSeats>` and the backend proves its concrete
  `GameHub`/`BotRepository` satisfy them with a compile-time assertion. The kernel still imports no host.
  `runBotLoop` and the bot helpers (`@game-hub/kernel/bot`) moved to the kernel too. A `createBotDriver`
  can now be written entirely from the neutral kernel side.
- **Contract gap #1 (the client transport layer) — deferred to D2, and closed there in D2b.** Package
  clients reached the shell's transport DTOs (`GamePayload`/`GameMessage`) and shared chrome
  (`TurnBanner`/`ActivityFeed`/`GameOver`) via the UI's `@` alias, which is why the UI host had to typecheck
  each package's `./client`. D2b published the DTOs on `@game-hub/kernel/client` and the chrome as
  `@game-hub/ui-kit` — see §4b.

What **D2** (out-of-repo) still forces that the in-workspace phase did not: a real `dist` (TS-source
consumption + Vite aliases don't survive `node_modules`), the Tailwind content-glob problem (§2 — answered
in §4b), enforced kernel-contract versioning (§4), and gap #1's `@game-hub/ui-kit` extraction (§4b).

**D2a is done (2026-07-29):** the kernel builds a real `dist`, is publish-ready as `1.0.0` (unpublished —
the npm org is the owner's manual step), and the kernel-contract check is live in the backend registry
with all five games declaring it. Details and findings in §4 "Delivered in D2a".

**D2b is done (2026-07-29) — contract gap #1 is closed.** The transport DTOs moved into
`@game-hub/kernel/client` (kernel → `1.1.0`, contract still `1`) and the shared chrome + the game-facing
REST helpers moved into a new publishable `@game-hub/ui-kit@1.0.0`. All five game packages now import
**nothing** from `ui/src`, an e2e architecture test enforces that, and each package typechecks all four of
its subpaths standalone. §2's Tailwind question is answered and proven. Details in §4b "Delivered in D2b".

**Hub-side response to the D2c findings (2026-07-30) — kernel → `1.2.0`, contract still `1`.** The
out-of-repo pilot's findings log (`docs/d2c-findings.md` in `whtdrgn101/game-labyrinth`) produced three
hub-side changes, all additive:

- **The colour channel (finding §16).** Labyrinth's owner ruling made the pawn colour *rules data* — the
  colour you pick is the corner you start on — and contract 1 typed `createGame`'s seats as `{ name }`
  only, so a lobby pick physically could not reach the rules. `GameModule.createGame` now takes
  `players: { name, color? }[]`, and the backend's `startGame` resolves every seat's colour **before**
  dealing (one `assignColors` call, whose result feeds both `createGame` and the `game_colors` store, so
  the two can never disagree) and threads it in. Strictly additive by the rule below: the host only *adds*
  a property, `{ name }[]` stays assignable to the widened parameter, and all five hosted games ignore
  the field. Proven both ways — the counter stub in `module-seam.test.ts` consumes it (and fails loudly
  if the threading is removed: verified by deleting it), and `colors.test.ts` deals Container and Stone
  Age from the same seed with picks and without and requires identical states.
- **The rng helpers on the `.` barrel (finding §13).** `mulberry32` lived only on `@game-hub/kernel/bot`,
  so an *engine* test had to import the bot subpath or re-implement it (every hub game did the latter),
  and the Fisher–Yates `shuffle` every dealer needs existed in four in-repo copies. Both now live in
  `packages/kernel/src/random.ts` and export from `.`; `./bot` re-exports `mulberry32` unchanged, and the
  four game copies (Saint Petersburg, Russian Railroads, Stone Age ×2, Container's module) were replaced
  by the kernel's — same algorithm, so every seeded deal is byte-identical.
- **The dependency contradiction (finding §2).** `game-creation.md` §1 said `dependencies:
  "workspace:*"` while §3 here says a game package **peer-depends** on the kernel. Both are right for
  different situations, and the recipe now opens with a table saying which one the reader is in:
  `workspace:*` in this repo (one install tree, so a duplicate is impossible), **peer + dev** for a
  package a host installs — with the three duplicate-copy failure modes named (`instanceof` breaking
  `mapError`, React double-loading, Tailwind's `@source` glob missing a nested copy).

### ✅ Delivered in D2d (2026-07-30) — the hub hosts a game it did not compile

The claim under test: **an out-of-repo game is an ordinary dependency.** Measured, not asserted —
`docker compose up --build`, then a Labyrinth game created and played over REST against the running
container and again in a real browser against it.

**What the hub had to add, in full:** two `dependencies` lines (`backend` + `ui`), one `games.config.ts`
entry, `pnpm generate`, and `vendor/` (see below). That is it. Specifically, **none** of the five shims
every in-workspace game needs was required:

| Shim an in-workspace game needs | Needed for Labyrinth? |
| --- | --- |
| a per-subpath `resolve.alias` in `ui/vite.config.ts` | **no** — it resolves out of `node_modules` |
| an `ui/tsconfig.json` `include` for its `./client` | **no** — it binds `@game-hub/kernel/client`, never the shell's `@/` |
| a `server.deps.inline` entry in `backend/vitest.config.ts` | **no** — it ships JS (the existing `@game-hub/game-` regex matches it harmlessly) |
| a workspace glob in `pnpm-workspace.yaml` | **no** |
| an extra Tailwind `@source` | **no** — see below |

**Three things that had to be got right, each of which failed first:**

1. **`tsc` emits relative specifiers verbatim** (the D2a lesson, re-learned game-side). The game's
   sources now carry explicit `.js` extensions — `from '../engine/index.js'` — which resolve to `.ts`
   in its own workspace *and* to the emitted `.js` in the tarball. Its `pnpm pack:smoke` (adapted from
   the kernel's) installs the tarball outside its repo and drives a real game under plain `node`; without
   the extensions the first import throws `ERR_MODULE_NOT_FOUND` while every other check stays green.
2. **Vite's dev-server dependency pre-bundling forked the shared singletons.** `@game-hub/game-labyrinth`
   lives under `node_modules`, so esbuild pre-bundled it — and pulled `@game-hub/ui-kit` *into* that
   bundle. Two copies of the ui-kit meant two copies of its module-level transport state: the shell's
   `configureTransport({ baseUrl: '/api' })` never reached the board's, and every action it sent 404'd at
   `/games/:id/actions`. (`RematchContext` identity has the same failure mode, silently.) Fixed with
   `optimizeDeps.exclude: ['@game-hub/kernel', '@game-hub/ui-kit']` — stated as a rule about the shared
   singletons, so it covers every future installed game. **Dev-server only**: `vite build` resolves
   through the same aliases with Rollup and always emitted a single transport, so the image was never
   wrong — which is exactly why this would have shipped as a mystery without an e2e suite.
3. **pnpm resolved the game's peers from the registry.** An external package declares plain semver peers
   (`@game-hub/ui-kit: ^1.0.0`); pnpm 10+ defaults `linkWorkspacePackages` to **false**, so the backend
   — which declares no ui-kit of its own, and shouldn't — got a *registry* copy grafted in, forking the
   game into two physical copies. `linkWorkspacePackages: true` in `pnpm-workspace.yaml` links the
   workspace package instead: one game copy, ui-kit peer resolved to `link:packages/ui-kit`.

**§2's Tailwind question, finally answered against a real host** (D2b proved the mechanism; D2c §11
could not test the hoisting). The existing `@source '../node_modules/@game-hub'` in `ui/src/index.css`
**does** reach an installed game: it follows pnpm's symlink and scans the compiled `.js` in `dist/`. Three
utilities that exist nowhere in this repo's sources — `max-w-[34rem]`, `lg:max-w-[20rem]`,
`outline-offset-[-3px]` — are present in the built stylesheet the container serves. **No glob change was
needed.** The other half of the answer (D2c §21: the ui-kit's ~16 semantic tokens) also held, because the
hub defines them; a host that doesn't still owes them.

**Code-splitting survived publication** (§3's open worry). `lazy(() => import('./Board.js'))` inside
`node_modules` still becomes its own chunk: the container serves six `Board-*.js` chunks and a browser
opening Labyrinth fetches exactly one of them.

**Distribution, and the one piece of scaffolding that is temporary.** The `game-hub` npm org exists
(the kernel and the ui-kit are published) but the *game* is not published yet, so the hub depends on a
**packed tarball committed under `vendor/`** with `"@game-hub/game-labyrinth": "file:../vendor/<tarball>"`
in both hosts. It is committed deliberately: a fresh clone and `docker build` must both install it with
`--frozen-lockfile`. `pnpm labyrinth:refresh` is the whole two-repo loop in one command (pack in
`../game-labyrinth` → drop in `vendor/` → rewrite the specifier → install). See
[`vendor/README.md`](../vendor/README.md) — publishing to npm deletes that directory and changes nothing
else, which is the point: the vendoring is a **distribution** detail, not an architectural one.

Original goal statement: four games had tested the engine and the seams; the long-term goal is making
games easier to add, and eventually addable from *outside* this repo. Pilot: Russian Railroads (a
heavyweight is the right stress test).

## D1 findings from RR1 (2026-07-24 — the pilot's first contact)

**What held:** registration really is one `games.config.ts` entry + `pnpm generate`; the four-subpath
package shape worked first try; the kernel contracts (generic hosts, React-free core) needed no
changes; five games coexist with the package-shaped one indistinguishable at runtime.

**What §2 predicted and TS-source shipping still costs** (all logged verbatim in the RR ROADMAP):
the workspace glob, two host `package.json` deps, the backend vitest inline regex, **per-subpath Vite
aliases** (the touchpoint-#2 duplication a real `dist` would kill), and a `ui/tsconfig.json` include
— the package client cannot typecheck standalone.

**Two contract gaps not in the original doc** (must close before D2):
1. **The client transport layer isn't in the kernel.** `GamePayload`/`GameMessage` and the shared
   chrome (`TurnBanner`/`ActivityFeed`/`GameOver`) live in `ui/src`, reached via the shell's `@`
   alias — so a package client still couples to this repo's UI. Fix candidates: move the transport
   DTOs into `@game-hub/kernel/client` and publish the shared chrome as `@game-hub/ui-kit` (or
   accept shell-coupling as in-workspace-only and document it).
2. **The bound `ModuleContext` lives in the backend shim.** A package's `createBotDriver` (RR10)
   can't name the concrete context without importing `backend/src` — either the kernel's generic
   context must be sufficient for drivers (preferred: drivers code against the generic surface), or
   the backend must export a public binding package.

This doc answers the four questions the roadmap poses: what a game package must export, how
registration/discovery works, what the version-compat contract with the kernel is, and what the seams
still assume about living in one workspace.

---

## 1. What a game *is* today — the touchpoint inventory

Adding game `foo` currently touches **seven registration points** across four packages (the
CLAUDE.md recipe, made explicit):

| # | Touchpoint | File | Nature |
|---|---|---|---|
| 1 | Engine subpath export | `engine/package.json` `exports["./foo"]` | mechanical |
| 2 | Vite alias for that subpath | `ui/vite.config.ts` | mechanical, **duplicates #1** |
| 3 | Backend module registration | `backend/src/games/index.ts` `.register(fooModule)` | one line |
| 4 | UI client registration | `ui/src/games/registry.ts` `CLIENTS` | one line + the one cast |
| 5 | Bot subpath export | `bot/package.json` `exports["./foo"]` | mechanical |
| 6 | The game folders themselves | `engine/src/games/foo/`, `backend/src/games/foo/`, `ui/src/games/foo/`, `bot/src/games/foo/` | the actual game |
| 7 | Reference material + roadmap | `reference_materials/`, per-game `ROADMAP.md` | docs |

Everything else is genuinely additive (proven four times). The friction is that one *game* is
**four sibling folders in four packages**, stitched by five config edits. Externalizing means: one
game = **one package**, one registration point per host.

## 2. The workspace assumptions that must dissolve

These are the things that only work because every game lives in this repo:

- **The engine ships TypeScript source, not a build.** The backend transpiles it via `tsx`/Vitest
  inline; the UI consumes it through **hand-maintained Vite aliases** (one per subpath — touchpoint
  #2). An external package cannot be consumed this way: **externalization forces a real `dist`**
  (the engine already has a `tsc` build target; it would become load-bearing for games).
- **The kernel lives *inside* `@game-hub/engine`** (`engine/src/kernel/`), and the backend's
  `GameModule` contract *restates* kernel types structurally (`MoveRecord`, `Viewer`) precisely so
  `module.ts` needn't import the engine. An external game needs a real shared dependency to build
  against: **the kernel must become its own package** (see §4).
- **The one registry cast** (`ui/src/games/registry.ts`) and the backend registry both assume
  registration happens in first-party code at build time. That stays true in phase D0–D1 (build-time
  registry, codegen'd); true runtime plugin loading is explicitly deferred (§6).
- **Tailwind content scanning**: game boards style themselves with Tailwind utility classes, and the
  UI's Tailwind build scans `ui/src/**`. A game package outside that glob would silently lose its
  styles — the content globs must include installed game packages (or games must ship compiled CSS).
  This is the sneakiest breakage in the list. ✅ **Answered in D2b** — explicit `@source`, no shipped CSS;
  the decision, the alternatives, and the measurement are in §4b.
- **The e2e `architecture.spec.ts`** derives the game list from the filesystem (`readdirSync` of
  `ui/src/games/`) — right for in-repo games, meaningless for installed ones. It would read the
  generated registry instead.
- **Coverage gates are per-repo.** The 100%/90% gates are *this repo's* discipline; the platform
  cannot enforce them on an external package. The compat contract (§5) is what replaces them.

## 3. The game-package contract (proposed)

One npm package per game — `@game-hub/game-<id>` (or any name; the manifest's `id` is what matters)
— with **four subpath exports**, mirroring the four seams that already exist:

```
@game-hub/game-foo
├── ./engine   — the pure rules core (what engine/src/games/foo/index.ts exports today)
├── ./module   — the backend GameModule implementation (server-only; may import ./engine)
├── ./client   — the UI GameClient (lazy Board behind dynamic import; may import ./engine)
└── ./bot      — optional; the game's policies (pure; may import ./engine)
```

- Ships **built JS + `.d.ts`** (`dist/`), not TS source — consequence of §2. Board lazy-loading
  survives: the client entry stays a light object whose `Board` is `lazy(() => import('./board'))`,
  and bundlers code-split dynamic imports inside `node_modules` fine.
- **Peer-depends on `@game-hub/kernel`** (§4). Never depends on the platform's backend or UI
  packages — the module/client program against *contract types* re-exported by the kernel package.
- A tiny static **manifest** export (id, name, seat bounds, colors palette, kernel-contract version)
  that both hosts read *without* loading the heavy entries — today's `GameInfo`, formalized.

## 4. The kernel package — `@game-hub/kernel`

Extract `engine/src/kernel/` + the *contract types* into one small published package:

- What's in it: `GameError`, `MoveRecord`, `Viewer`, `record()`, `makeSeating`, `GameEndState` (all
  already kernel), **plus** the `GameModule`/`ModuleContext`/`BotDriver` interfaces (today in
  `backend/src/games/module.ts`) and the `GameClient` interface (today in `ui/src/games/types.ts`).
- The backend/UI keep their local copies as re-exports during migration, so this is a pure move.
- This resolves the current duplication where `module.ts` structurally restates `MoveRecord` — that
  trick exists *because* there was no shared package; with one, the restatement retires.

**Version-compat contract:** the kernel package's **major version is the contract version**. A game
manifest declares `kernelContract: N`; the registries refuse (loudly, at registration — the
`GameRegistry.register` throw pattern) a game whose declared contract ≠ the host's. Rules:

- Additive, optional additions to `GameModule`/`ModuleContext` (new optional hooks — the
  `pendingStep`/`onStateChanged` precedent) = **minor** bump; old games keep working.
- Anything that changes a required member's meaning = **major** bump; games must migrate.
- The platform promises `ModuleContext` stability within a major: injected rng, `games`, `hub`,
  `pushGame`, bot seats — the things every module already leans on.
- A game's own state-shape evolution stays *its own* business via `schemaVersion`/`migrate`
  (architecture review §4.1) — deliberately orthogonal to the kernel contract version.

### ✅ Delivered in D2a (2026-07-29) — the kernel is publishable, and the contract is enforced

**Publish shape.** `@game-hub/kernel` is `1.0.0`, no longer `private`, `files: ["dist"]`, BSD-3-Clause,
`repository` + `keywords`, `publishConfig.access: "public"`, `prepack` → `tsc -p tsconfig.build.json`.
The workspace is untouched: the top-level `exports` still point at **TS source** (`./src/index.ts` …),
because the backend's esbuild bundle, the UI's Vite aliases and every vitest run consume source — and
`publishConfig.exports` (a pnpm feature applied at pack/publish time) rewrites the same three subpaths
to `dist/`, `types` condition first, with `main`/`types` fallbacks for older resolvers. `./package.json`
is exported too, so tooling can read the manifest. So **one package, two resolutions**, and no host
change in this slice.

**⚠️ Finding — the pre-D2a build emitted a package Node could not load.** `tsconfig.build.json` already
produced JS + `.d.ts` + source maps for all three subpaths, but under `moduleResolution: Bundler` `tsc`
emits relative specifiers **verbatim**: `export { GameError } from './errors'`. Node ESM does no
extension resolution, so the installed package threw `ERR_MODULE_NOT_FOUND` on the very first import —
invisible to every suite in this repo, all of which read the TS source. Fix: shipped kernel files now
write relative imports with an explicit **`.js` extension**, which resolves to the `.ts` source
in-workspace (TS, Vite, Vitest and esbuild all do the `.js`→`.ts` mapping) *and* to the emitted `.js` in
the tarball. Test files are excluded from the build and keep the extensionless style. **Any game package
that later ships a `dist` inherits this rule.**

**React stays type-only.** `./client` imports `ComponentType`/`LazyExoticComponent` as `import type`, so
the emitted `client.js` is `export {}` and the kernel ships with **zero runtime dependencies**;
`@types/react` is an **optional peer** (`peerDependenciesMeta`), needed only by a consumer that actually
typechecks the client contract. The pack smoke asserts both (no `react` resolvable, `dependencies` empty).

**Contract enforcement.** The kernel exports `KERNEL_CONTRACT_VERSION` (= 1) from `src/contract.ts`,
which carries the additive-minor / breaking-major rule in full. `GameModule` gained an optional
`kernelContract?: number`; `GameRegistry.register` refuses a mismatch with the existing throw pattern,
next to the duplicate-id and seat-bound checks. All five games declare
`kernelContract: KERNEL_CONTRACT_VERSION` — imported from the kernel they compiled against, never a
literal, so a game resolving a *different* kernel copy carries that copy's number and gets caught.

- **Where it lives:** on the **module**, not a separate manifest — a game's static identity (`id`,
  `name`, seat bounds, `colors`) already lives there and the registry already validates it, so this is
  the smallest honest change. The UI's client list has no registration step, and a game's module and
  client ship in one package against one kernel, so one check per package is enough.
- **A game that omits the declaration is treated as contract 1** and registers normally. Decision: every
  hosted game predates the field, and defaulting keeps the transition additive rather than a flag day.
  ⚠️ **When a contract 2 lands, that default becomes a lie — make `kernelContract` required then.**

**Pack smoke — the out-of-workspace proof.** `packages/kernel/scripts/pack-smoke.mjs`
(`pnpm --filter @game-hub/kernel pack:smoke`, wired into CI's test job after `pnpm test`) packs the
kernel, `npm install`s the tarball into a throwaway project under the OS temp root, then drives it twice:
plain `node` over all three subpaths asserting `record()`/`GameError`/`makeSeating`/the bot primitives
behave, and `tsc --noEmit` on a game-shaped consumer under **`nodenext`** resolution with
`skipLibCheck: false` — the strictest mode, which honours the `exports` map exactly as Node does and
rejects extensionless specifiers inside the shipped `.d.ts`. Green there ⇒ a `bundler`-resolution
consumer is safe by construction.

**⚠️ Latent trap for the Docker deploy.** `pnpm --filter @game-hub/backend --legacy deploy --prod` honours
`files: ["dist"]` when it clones a workspace package but does **not** apply `publishConfig`. The image never
builds the kernel, so the deployed `node_modules/@game-hub/kernel` is now **just a `package.json`** — an
empty package whose `exports` still point at `./src/…`. Harmless today: the backend ships as a
self-contained esbuild bundle with every workspace TS dep inlined, so nothing resolves that package at
runtime — and pre-D2a it shipped `src/*.ts`, which Node could not have loaded either, so this is not a
regression. **Measured, not assumed:** with `dist/` deleted, `pnpm deploy --prod` + the bundle + those
`node_modules` boot and serve REST (`backend/scripts/smoke.mjs` → `SMOKE OK`). If the backend ever stops
bundling its workspace deps, this becomes a real break — build the kernel in the image then.

**Not in this slice:** the actual `npm publish` (the `game-hub` npm org does not exist yet) and a
package `README.md` (npm shows "no readme" without one).

## 4b. The UI-side packages — `@game-hub/kernel/client` + `@game-hub/ui-kit`

### ✅ Delivered in D2b (2026-07-29) — contract gap #1 is closed

**The rule that decides what goes where:** *if a game client imports it, it must be published; if only
the shell imports it, it stays in `ui/src`.* Applied to the audit, that split the old `ui/src` shared
surface three ways.

**1. Contract → `@game-hub/kernel/client`** (new `src/contracts/transport.ts`, type-only, re-exported from
the `./client` subpath): `GamePayload<S>`, its `GameIdentity` base, and `GameMessage`. Nothing else — the
shell-only DTOs (`Lobby`, `GameInfo`, `GameSummary`, `NewSeat`, `StatePush`, `RematchInfo`) never cross the
game seam and stayed put. The kernel emits an empty `client.js` still, so it keeps its zero runtime
dependencies.

- **Version: `1.1.0`, contract still `1`.** Purely additive — nothing changed shape, nothing became
  required — so by `contract.ts`'s own rule this is a minor bump and a game built against `1.0.0` still
  compiles and registers. The reasoning lives in `contract.ts` beside the constant, as a version history.
- **`GameClient`/`BoardProps` keep their `Payload`/`Message` generic parameters** even though the kernel
  now owns the DTOs. Binding them would drop two type parameters — a *breaking arity change*, i.e. a major
  bump — for a cosmetic win. Each game still writes the two-line binding in `client/types.ts`; it now
  imports the contract and the DTOs from the same specifier.

**2. Chrome + game-facing transport → `@game-hub/ui-kit@1.0.0`** (new `packages/ui-kit`, publish shape
mirroring the kernel's: dev `exports` → TS source, `publishConfig.exports` → `dist/`, `files: ["dist"]`,
`access: public`, `prepack` → `tsc`, `.js` extensions on relative imports, README). The audit found the
gap was **wider than the three components the slice named**: the five clients also imported `ActionTip`,
`PanZoom`, `seatIdentity`, `Button`, `Card`, `cn`, and six functions from `lib/api`. All of it moved.
React is a real `peerDependency` (two copies = a broken app); `@game-hub/kernel` is a peer too (type-only
use); `clsx`/`tailwind-merge`/`class-variance-authority`/`lucide-react` are real dependencies.

- **⚠️ `import.meta.env` cannot ship in a published package.** `lib/api.ts` derived its base URL from
  Vite's `import.meta.env.PROD` (dev proxies `/api`; prod serves the API at the origin root). That's a
  *bundler* constant — baked into a `dist/`, it is fragile at best and wrong at worst for an installed
  consumer. So the ui-kit exports `configureTransport({ baseUrl })` + `apiUrl(path)`, the **host** calls it
  once in `main.tsx`, and every game builds URLs through `apiUrl`. Games that hard-coded `${BASE_URL}/…`
  were rewritten. This is the one API shape change in the slice.
- **`RematchContext` moved with `GameOver`**, so the rematch button still reaches the shell through
  context. That makes ui-kit **duplication-sensitive**: two copies of the package = two distinct contexts =
  a silently missing button. Hence the peer dep, and hence the single Vite alias in the hub.

**3. Everything else stayed in `ui/src`:** the landing/header/waiting room, the catalog + lobby + resume +
abandon + rematch endpoints, and `subscribeGame` — **the shell owns the socket**, and it is the one piece
of transport a game must not touch. `lib/api.ts` re-exports the ui-kit's shared half so shell code keeps a
single import site.

### The Tailwind answer (§2's "sneakiest breakage") — explicit `@source`, no shipped CSS

**Decision: the ui-kit (and every game package) ships utility classes in its source and *no CSS at all*;
the host adds one `@source` line so its own Tailwind build compiles them.** Write it into the host's
stylesheet exactly like this:

```css
@import 'tailwindcss';
@source '../../packages';                  /* in-workspace packages (this repo only) */
@source '../node_modules/@game-hub';       /* the same packages as installed — what an external host needs */
```

Why this and not the alternatives:

- **Shipping compiled CSS from each package** would freeze the theme at *package* build time. The chrome
  styles itself with the host's semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`), so
  it inherits the host's light/dark theme; a prebuilt stylesheet would either hard-code one theme or
  duplicate the token layer. It also means two cascade sources fighting over specificity, and no
  tree-shaking of unused utilities.
- **A Tailwind preset/plugin from the package** solves theming but not content scanning — the host would
  *still* need to point at the package's markup.
- The cost of the chosen answer is exactly one line per host, and it is the shape Tailwind v4 documents
  for component libraries.

**Measured, not assumed** (`pnpm --filter @game-hub/ui build`, greping the emitted CSS for three classes
that exist **only** in `packages/ui-kit/src` — `max-h-56`, `origin-top-left`, `touch-none`):

| `@source` lines in `ui/src/index.css` | emitted CSS | the three chrome classes |
|---|---|---|
| none | 22.88 kB | **absent** — silently pruned, the failure mode this exists to prevent |
| `../node_modules/@game-hub` only | 59.86 kB | present |
| both (shipped) | 59.86 kB, **identical content hash** | present |

The middle row is the finding: **an explicit `@source` does descend into `node_modules`** (through pnpm's
symlinks, and one glob covers a package's `src` in-workspace *and* its `dist` when installed) — so the
node_modules glob alone reproduces the whole build byte-for-byte. No compiled-CSS fallback was needed.
⚠️ Tailwind's *automatic* detection still skips `node_modules`; only the explicit directive works.

### Enforcement, and what it bought

`ui/e2e/architecture.spec.ts` gained **"no game package reaches into the UI shell"**: any `@/…` or
`ui/src` import from `packages/games/*/src` fails the suite. It is a static test for the same reason its
sibling is — the `@` alias resolves fine in-workspace, so typecheck, unit tests and the production build
all stay green while the package is quietly unpublishable. *Verified by breaking it:* adding
`import { cn } from '@/lib/utils'` to Can't Stop's board fails the spec with the offending path; reverted.

**Side effect worth having: every game package now typechecks all four subpaths standalone** (`include:
["src", …]`, `jsx: react-jsx` + DOM libs). The D1 finding "a TS-source game package can't fully typecheck
its own client" is retired — the client's only non-React dependencies are the two published packages. The
UI host still typechecks the clients too, which is what proves each board's props line up with the shell.

**Also found, and fixed, in passing:** ESLint's React + hooks rules were scoped to `ui/**` only, so they
stopped applying to any game client the moment Track D moved it into a package — and to the chrome the
moment D2b moved it. The globs now follow the JSX (`packages/ui-kit/**`, `packages/games/*/src/client/**`),
which immediately surfaced two real `react/no-unescaped-entities` violations in the Russian Railroads
client that had been unlinted since the migration. Both fixed.

**Not in this slice:** the actual `npm publish` of either package (the `game-hub` org still doesn't exist),
and any move of the hosts onto `dist` consumption — in-workspace they still read TS source, exactly as
D2a decided.

## 5. Registration & discovery

**Build-time, declarative — a `games.config.ts` at the repo root:**

```ts
export default ['@game-hub/game-container', '@game-hub/game-cantstop', /* … */];
```

A small codegen step (run in dev/build) turns that list into the two generated registries: the
backend's (imports each package's `./module`, `.register()`s them) and the UI's (imports each
`./client`). This keeps: the boot-time duplicate-id crash, the one documented cast, tree-shaking,
and static types. Adding a game becomes `pnpm add` + one line in one file.

What the platform **checks at registration** (replacing the coverage gates it can't enforce): id
uniqueness, seat bounds sanity, palette validity, kernel-contract match — plus a documented
"honest checklist" a game author runs (`module-seam`-style conformance suite exported by the kernel
package as a test helper: viewFor redaction round-trip, version monotonicity, parseAction
refuses server-only actions, legalActions ⊆ applyAction fuzz).

## 6. Explicitly deferred

- **Runtime plugin loading** (drop a package in, no rebuild): module federation / import maps /
  server-side dynamic `import()`. Real value only after the package contract has survived an
  out-of-repo pilot; adds signing/trust questions (a module runs server-side with DB access).
- **A generic sealed-input framework, still.** Container's auction stays behind `routes`/
  `pendingStep` — externalization doesn't change the "extract on the third example" rule.
- **Publishing to a public npm registry.** Workspace/git dependencies are enough for the pilot.

## 7. Migration plan — three phases, each shippable

- **D0 — in-repo restructure (pure refactor, the C0 discipline).** Extract `@game-hub/kernel`
  (workspace package, engine keeps re-exporting for compat); add `games.config.ts` + registry
  codegen; teach Tailwind the package globs; point `architecture.spec` at the generated registry.
  All four games keep living where they are. Every suite green, zero behavior change.
- **D1 — one game moves.** Can't Stop (smallest, no side-channels) becomes
  `packages/games/cantstop/` in-workspace with the four-subpath shape, consumed *as a package*
  (its `dist`, not aliases). This is the honest test of §3 — the workspace's version of the
  module-seam stub. Bake time: does DX survive (watch mode, test cycles)?
- **D2 — the out-of-repo pilot.** Russian Railroads built in its own repo against published (or
  git-dep) `@game-hub/kernel`, following the conformance checklist. What D2 surfaces that D1
  can't: docs quality, contract completeness, the real dependency/versioning friction.

## 8. Open questions for the owner

1. **Bot placement**: `./bot` inside the game package (proposed — it versions with the game) vs. a
   separate package. The `createBotDriver` hook already lives module-side, which argues for inside.
2. **Reference PDFs**: stay out of packages (copyright) — is a rulebook-page *citation convention*
   alone enough for external authors, or does the conformance checklist need a "rules provenance"
   section?
3. **Per-game e2e**: does the platform host a Playwright harness external games can plug specs
   into (heavy), or is e2e simply out of contract for external games (module conformance + their
   own testing)? Proposed: out of contract for D2; revisit if externals proliferate.
4. **Naming**: `@game-hub/game-<id>` asserts an org scope we don't own on npm. Fine for
   workspace/git deps; decide before any publish.
