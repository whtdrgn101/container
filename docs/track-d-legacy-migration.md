# Track D — migrating the four legacy games to the package shape (working plan)

**Status: ✅ complete (2026-07-27).** All seven phases landed. Russian Railroads proved the in-workspace
game-package shape (`packages/games/russianrailroads/`, four subpath exports over `@game-hub/kernel`); this
plan then retrofitted the four legacy games — Can't Stop (pilot), Stone Age, Saint Petersburg, Container
(heaviest last) — onto the same shape, retired `@game-hub/engine` and `@game-hub/bot`, and slimmed the
docs. Every game now lives in its own `@game-hub/game-<id>` package; the platform hosts them all
indistinguishably at runtime. Each phase landed green.

This file records the migration decisions and findings. Its conclusions folded into
`track-d-externalize-games.md` (design status) and into the two reference docs the doc phase produced —
`design-patterns.md` (how it works) and `game-creation.md` (the current recipe). CLAUDE.md slimmed to
pointers.

## Decisions (made up front, from the RR1 findings log)

1. **The package shape is RR's, exactly.** `packages/games/<id>/` with `package.json` name
   `@game-hub/game-<id>`, subpath exports `./engine`, `./module`, `./client`, `./bot` (TS source),
   dependency on `@game-hub/kernel` (`workspace:*`), React as a peer for `./client`, own
   `vitest.config.ts` + `tsconfig.json` (RR's `include` split: the package typechecks
   `engine`/`module`/`bot`; the **UI host typechecks the client** via `ui/tsconfig.json` include).
   The per-game `ROADMAP.md` moves to the package root (RR precedent).
2. **Coverage gates move with the code.** Each package's vitest config gates
   `src/engine/**` at **100%** and `src/bot/**` at **90%** using per-glob `thresholds` (vitest
   supports glob-keyed threshold entries). Port each game's existing coverage `exclude` entries
   (barrels, type-only files, `tests/**`) from `engine/vitest.config.ts` and `bot/vitest.config.ts`
   verbatim — the gate must not silently weaken. Bot self-play tests move with the bot.
3. **Contract gap #2 (the bound `ModuleContext`) closes structurally.** The kernel gains minimal
   *structural* interfaces for the two host generics modules actually use — a hub with
   `broadcastEach`, a bot-seats store with `listForGame` (+ the difficulty read the runners use) —
   defined in `packages/kernel/src/contracts/` next to `ModuleContext`. Game packages type
   themselves as `GameModule<S, A, ModuleContext<Db, Hub, BotSeats>, FastifyInstance>` binding
   those structural types; the backend's concrete `GameHub`/`BotRepository` must satisfy them
   (compile-time assertion in the backend, so drift is a type error). The kernel still imports no
   host.
4. **Third-party host types come in as devDependencies.** A package whose module has `routes`
   adds `fastify` as a devDependency (type-only imports; the runtime instance is the host's).
   Container's `auctions.ts` adds `better-sqlite3` the same way for the `Db` generic. No package
   may depend on `@game-hub/backend` or `@game-hub/ui` — that would be a workspace cycle.
5. **`botLoop` is kernel code.** `backend/src/botLoop.ts` is already structural and imports no
   host; it moves to `@game-hub/kernel` (with its tests, under the kernel's 100% gate). The
   backend keeps a re-export shim until phase 6 cleanup.
6. **The bot helpers become `@game-hub/kernel/bot`.** `bot/src/kernel/` (`BotError`,
   `assertBotTurn`, `makeProgressGuard`, the benchmark helpers) moves to a new kernel subpath
   (framework-free, no React — so it does not belong in `./client`). `bot/src/kernel` becomes a
   re-export shim until the bot package retires.
7. **Client coupling to the UI shell stays, documented.** Package clients keep importing
   `@/lib/api` and the shared chrome (`TurnBanner`/`ActivityFeed`/`GameOver`/`seatIdentity`) via
   the `@` alias — RR's accepted in-workspace coupling (design-doc contract gap #1). Extracting a
   `@game-hub/ui-kit` stays deferred until an out-of-repo game exists to need it.
8. **`@game-hub/engine` and `@game-hub/bot` retire at the end**, not per game. While any game
   remains in the old location, the old packages keep their (shrinking) exports and gates. The
   final cleanup deletes both packages, their workspace entries, root `test:engine`/`test:bot`
   scripts (replaced by per-package filters), the engine Vite aliases, and relocates
   `bot/src/bench.ts`.

## The per-game retrofit recipe

For game `<id>` (engine folder name = game id = package suffix):

1. **Scaffold** `packages/games/<id>/` — `package.json`, `tsconfig.json`, `vitest.config.ts` per
   decisions 1–2 (copy RR's and adjust; add the bot threshold glob and the game's coverage
   excludes; add `fastify`/`better-sqlite3` devDeps only if used).
2. **Move code with `git mv`** (history survives):
   - `engine/src/games/<id>/` → `src/engine/` (its `tests/` ride along; `ROADMAP.md` → package root)
   - `bot/src/games/<id>/` → `src/bot/`
   - `backend/src/games/<id>/` → `src/module/`
   - `ui/src/games/<id>/` → `src/client/`
3. **Rewrite imports** (the only code edits — behaviour must not change):
   - engine: `../../kernel` → `@game-hub/kernel`
   - bot: `../../kernel` → `@game-hub/kernel/bot`; `@game-hub/engine/<id>` → `../engine`
   - module: `@game-hub/engine/<id>` → `../engine`; `@game-hub/bot/<id>` → `../bot`;
     `../module` → `@game-hub/kernel` (bind the ctx generics per decision 3);
     `../../botLoop` → `@game-hub/kernel`; `../../bots` / `../../db` types → the structural
     kernel types / devDep types
   - client: `@game-hub/engine/<id>` → `../engine`; shell imports stay on `@/…`
4. **Host wiring** (the RR1 findings checklist, applied in reverse where the old game is removed):
   - `games.config.ts`: the entry becomes
     `{ id: '<id>', module: '@game-hub/game-<id>/module', client: '@game-hub/game-<id>/client' }`;
     run `pnpm generate` (both registries must regenerate cleanly).
   - `backend/package.json` + `ui/package.json`: add `"@game-hub/game-<id>": "workspace:*"`.
   - `ui/vite.config.ts`: add the `/client` alias → the package source file; **remove** the
     `@game-hub/engine/<id>` alias (nothing may import it once the client uses `../engine`).
   - `ui/tsconfig.json`: add `../packages/games/<id>/src/client` to `include`.
   - `engine/package.json` / `bot/package.json`: remove the `./<id>` subpath export.
   - `pnpm install` to relink.
5. **Chase stragglers**: backend tests importing `@game-hub/engine/<id>` or `@game-hub/bot/<id>`
   switch to `@game-hub/game-<id>/engine` / a relative package path (add the package as a backend
   devDep-visible workspace dep — it already is, from step 4). e2e specs import nothing from games;
   testids must not change.
6. **Verify** — all of: `pnpm typecheck`, `pnpm -r test` (kernel, the new package, remaining
   engine/bot, backend), `pnpm generate` + clean `git diff` on the generated files, `pnpm lint`,
   `pnpm format:check`, and the game's own e2e spec + `architecture.spec.ts`
   (`pnpm --filter @game-hub/ui exec playwright test <specs>`). Visual baselines must not move.

## Phase order

| Phase | What | Task | Status |
|---|---|---|---|
| 1 | Kernel prep (decisions 3, 5, 6) — pure moves + new structural contracts, everything green | #1 | ✅ |
| 2 | Can't Stop (pilot retrofit: routes + rng + bot + difficulty tiers) | #2 | ✅ |
| 3 | Stone Age | #3 | ✅ |
| 4 | Saint Petersburg | #4 | ✅ |
| 5 | Container (auctions table, hub push, pendingStep, preStep bot loop) | #5 | ✅ |
| 6 | Retire `engine/`+`bot/`, host cleanup, Dockerfile/scripts | #6 | ✅ |
| 7 | Docs: CLAUDE.md, ROADMAP.md, design doc, README, REVIEW.md pointers | #7 | ✅ |

**Phase 7 shape (owner request, 2026-07-27):** two new reference docs carry the platform
explanation out of CLAUDE.md —

- **`docs/game-creation.md`** — the complete "add a game" recipe for the package shape: the
  package contract (four subpath exports, kernel dep, devDep rules), the scaffold, the host
  wiring checklist, coverage gates, testing expectations (engine 100%, bot 90%, backend REST
  suite, e2e spec), and the per-game conventions (one mechanic = one file, rulebook citations,
  injected randomness, `viewFor` as an explicit decision).
- **`docs/design-patterns.md`** — how the platform works and why: the engine-purity rule, the
  `GameModule`/`GameClient` seams, coordination-state-outside-the-engine (lobbies, auctions,
  bots, colours, rematch), redaction (`viewFor`, auction views, "everything logged is public"),
  the transport (REST-authoritative, push-only WS), schema versioning, the kernel contract and
  its structural host types, and the extract-on-the-third-example restraint rule.

**CLAUDE.md then slims down** to: what the project is, the working agreement, commands, the
non-negotiables, and *pointers* to those two docs + the roadmaps — not a restatement of them.

## Pilot findings (Phase 2, Can't Stop — apply to phases 3–5)

The RR recipe held; a game with **routes + a bot** needs exactly these additions RR didn't:

- **`src/module/context.ts`** — the package-local binding
  `ModuleContext = KernelModuleContext<unknown, ModuleHub, ModuleBotSeats>` and
  `GameModule<S,A> = KernelGameModule<S, A, ModuleContext, FastifyInstance>`; module files import
  these instead of the backend shim. Container additionally binds `Db` (better-sqlite3) for its
  auctions table.
- **`src/client/types.ts`** — the RR-pattern `GameClient`/`BoardProps` binding (a package can't
  import `ui/src/games/types.ts`).
- **`fastify` as a type-only devDependency** for `routes.ts`.
- **Two per-glob vitest thresholds**: `src/engine/**` 100%, `src/bot/**` 90%, excludes ported
  verbatim from the old engine/bot configs.
- Bot runners retype their `BotRepository` param to the kernel's `ModuleBotSeats` (they use only
  `listForGame`/`difficultiesForGame`).
- The bench aggregator (`bot/src/bench.ts`) imports the migrated game's `benchmark` from
  `@game-hub/game-<id>/bot`, so `bot/package.json` gains the game as a workspace dep (no cycle).
- `backend/src/games/index.ts`'s named module re-export repoints to the package (backend tests
  import it via `../games`).
- `ui/e2e/architecture.spec.ts` now also forbids `@game-hub/game-*` imports in shell files
  (done in Phase 2; later phases just keep it green).
- Doc-comment strings naming old paths (`@game-hub/bot/<id>` etc.) are updated with the move;
  CLAUDE.md/ROADMAP.md mentions wait for Phase 7.
- **Routeless variant (Phase 4, Saint Petersburg):** a module with no `routes.ts` skips the
  `fastify` devDep entirely and leaves the `App` generic at its `unknown` default in
  `context.ts` — contravariance makes that assignable to the backend registry's
  `App = FastifyInstance` slot since `routes` is absent.
- **Test-visibility exports:** packages expose only their four barrels (no deep imports), so a
  host test that unit-tests a module internal (SP's `mapStPetersburgError`) gets it re-exported
  from the `./module` barrel rather than a deep path.
- Subfolder import depth: files under `src/bot/tests/`, `src/client/art/` etc. reach the engine
  as `../../engine`, not `../engine`.
- **Third-party client deps are the package's own (Phase 5, Container):** a client that imports
  a UI lib directly (Container's `lucide-react` icons) declares it as a real dependency of the
  game package — it can't lean on `ui/node_modules` resolution. Clients that reach such libs
  only transitively through `@/components/ui/*` wrappers need nothing.
- **`Db` binding (Phase 5, Container):** a module that opens its own table binds the
  `ModuleContext` `Db` generic to better-sqlite3's `Database` via type-only
  `better-sqlite3` + `@types/better-sqlite3` devDeps; the other games leave `Db` at `unknown`.

## Invariants that must hold at every phase

- Zero behaviour change: same wire payloads, same testids, same visual baselines, same error codes.
- The generated registries stay Prettier-clean and freshness-checked.
- No game package imports `@game-hub/backend`, `@game-hub/ui`, or another game.
- The shell still imports no game (architecture spec — extend it to also forbid
  `@game-hub/game-*` imports outside `ui/src/games/registry*` once the first package lands).
- Engine purity, `viewFor` redaction, and the coverage bars are unchanged.
