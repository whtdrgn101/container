# CLAUDE.md — Game Hub (self-hosted board-game platform)

Context and working agreement for this repo. Read this first, then the two reference docs it points to.

## What we're building

**Game Hub** — a self-hosted board-game platform (a "games room") that hosts *multiple* games behind
shared engine/backend/UI seams. Each game is its own in-workspace package (`packages/games/<id>/`); the
platform is game-agnostic. The games:

| Game | Players | Kind | Status |
|------|---------|------|--------|
| **Container** (10th Anniv.) | 3–5 | economic supply-chain — you can never buy/ship *your own* containers | core game complete; AI A0–A2 shipped (A3–A5 optional) |
| **Can't Stop** | 2–4 | push-your-luck dice | complete + bot (CS1) + difficulty tiers (CS4); only variants (CS3) remain |
| **Stone Age** | 2–4 | worker-placement Euro | **complete** (SA0–SA15): full game, illustrated board, bot, 2–3-player rules, deck redaction |
| **Saint Petersburg** (1st ed.) | 2–4 | card-buying engine | **complete** (SP0–SP9): first game with real hidden info (hand + rubles secret) |
| **Russian Railroads** (Ultimate ed.) | 2–4 | worker-placement | **in build** — base game + art (RR9) complete; board-UI revamp (RR9b) queued behind the Labyrinth kickoff (it should borrow Labyrinth's board-UI findings); bot (RR10) after; the Track D **package pilot** |
| **Labyrinth** (Ravensburger) | 2–4 | sliding-maze race, hidden treasure targets | **next up — the Track D D2 pilot**: game 6, built *out-of-repo* (`whtdrgn101/game-labyrinth`, public) against published `@game-hub/*`; kickoff decisions + rules digest + slices in [`docs/game-labyrinth-kickoff.md`](./docs/game-labyrinth-kickoff.md) |

Per-game rules and slice history live in each game's `packages/games/<id>/ROADMAP.md`; the authoritative
rules are the rulebook PDFs in `reference_materials/` (gitignored — copyrighted). ⚠️ **Read the spec
before implementing a rule** — never from memory.

**Naming split:** the **platform** is "Game Hub" (npm scope `@game-hub/*`). **Container** is one game *on*
it (id `container`), not the platform. Don't conflate them.

## Non-negotiables (set at kickoff, still binding)

- **100% unit-test coverage of every game engine** (rules), enforced per game by a `src/engine/**`
  coverage gate. The bot gate is **90%** (heuristics shouldn't fight a 100% bar).
- **Tests ship with the code, not after.** A feature without tests isn't finished.
- **The engine is pure** — no `Date`, no `Math.random`, no mutation. Randomness is **injected** (at setup
  `createGame({ rng })`, per action `ModuleContext.rng`). A module reaching for `Math.random` is a bug.
- **Read the rulebook per mechanic**; cite the page in a comment. Don't implement from memory.
- The UI has **Playwright** tests, including **responsive** regression from desktop to 320px mobile.
- Monorepo with per-game packages behind game-agnostic hosts.

## Architecture sketch

```
packages/
  kernel/          @game-hub/kernel — the neutral dependency every game + both hosts build on:
                     primitives (GameError, MoveRecord, Viewer, record, makeSeating, GameEndState),
                     runBotLoop, the GameModule/GameClient contracts (host bindings are generics),
                     the transport DTOs (GamePayload/GameMessage), and the
                     @game-hub/kernel/{client,bot} subpaths. Its own 100% gate. Published (1.1.0).
  ui-kit/          @game-hub/ui-kit — the shared board chrome every game's UI renders inside
                     (TurnBanner, ActivityFeed, GameOver, ActionTip, PanZoom, Button/Card, cn,
                     seatIdentity) + the game-facing REST calls (getGame/applyAction/apiUrl).
                     React is a peer; no CSS ships (Tailwind classes in source). Published (1.0.0).
  games/<id>/      @game-hub/game-<id> — one package per game, four TS-source subpath exports:
                     ./engine (pure rules, 100% gate)  ./module (backend seam)
                     ./client (UI seam)  ./bot (AI, 90% gate) + its own ROADMAP.md.
                     ⚠️ A ./client may import ONLY @game-hub/kernel/client + @game-hub/ui-kit —
                     never ui/src (e2e architecture.spec.ts enforces it).
  bench/           @game-hub/bench — dev-only bot-strength harness (root `pnpm bench`)
backend/           @game-hub/backend — game-agnostic Fastify REST core + SQLite + the generated registry
ui/                @game-hub/ui — game-agnostic React + Tailwind + shadcn shell + the generated registry
games.config.ts    the ordered list of hosted games → `pnpm generate` → the two checked-in registries
```

**Data flow:** UI → REST → backend → **module → engine** (authoritative) → SQLite snapshot + move log.
The backend then **pushes** new state to every client over a push-only WebSocket, each projected
per-viewer via the module's `viewFor`. Adding a game is **additive** — one `games.config.ts` entry +
`pnpm generate` + one dep/alias/include line per host (see `docs/game-creation.md`).

| Layer | Choice | Why |
|-------|--------|-----|
| Mono | pnpm workspaces | first-class workspace deps |
| Lang | TypeScript strict (`noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | one language end-to-end |
| Engine | plain TS + Vitest (v8, 100% gate) | pure logic, fastest tests |
| Backend | Fastify 5 + better-sqlite3 | fast; synchronous SQLite is simple and plenty |
| DB | SQLite: `games` (JSON snapshot) + `moves` (append-only log) | serializable state → replay/audit |
| UI | Vite 6 + React 19 + Tailwind v4 + shadcn (copied into `ui/src/components/ui`, extend in place) | modern, fast |
| UI tests | Playwright (Chromium desktop + Pixel 5 mobile) | e2e + responsive regression |

## How it works & how to add a game — the reference docs

The platform explanation now lives in two docs. Read them before touching platform or game code:

- **[`docs/design-patterns.md`](./docs/design-patterns.md)** — how the platform works and why: the three
  seams (engine purity + injected randomness, `GameModule` + `ModuleContext` and its structural host
  types, `GameClient` + the shell's ignorance of games), coordination-state-outside-the-engine (lobbies,
  auctions, bots, colours, rematch), redaction (`viewFor` semantics, auction views, "everything logged is
  public"), transport (REST-authoritative, push-only WS + its origin check), persistence
  (`schemaVersion`/`migrate` vs `ADDED_COLUMNS`, optimistic concurrency, the abandon pre-handler), bots,
  the kernel contract & versioning, the extract-on-the-third-example restraint rule, and testing. **The
  ⚠️ hazard notes there each mark something that actually broke — respect them.**
- **[`docs/game-creation.md`](./docs/game-creation.md)** — the complete, executable "add a game" recipe
  for the package shape: scaffold (package.json/tsconfig/vitest per-glob gates), the four subpaths and
  what belongs in each, the host-wiring checklist, testing expectations, and a final verification checklist.

History and rationale: **[`docs/track-d-externalize-games.md`](./docs/track-d-externalize-games.md)** (the
game-package design) and **[`docs/track-d-legacy-migration.md`](./docs/track-d-legacy-migration.md)** (the
migration that made all five games package-shaped). Platform roadmap:
**[`ROADMAP.md`](./ROADMAP.md)**; per-game roadmaps at `packages/games/<id>/ROADMAP.md`. The 2026-07
architecture review (`REVIEW.md`) is **retired** — its remaining items live in ROADMAP.md's
"Review backlog" section (full text in git history; code comments citing "REVIEW §x.y" refer to it).
Deployment: **[`DEPLOY.md`](./DEPLOY.md)**.

## Commands

```bash
pnpm install                # bootstrap the workspace

# Tests
pnpm test                   # every workspace's tests (pnpm -r test)
pnpm test:games             # every game package's engine 100% + bot 90% gates (@game-hub/game-*)
pnpm test:backend           # backend integration tests (Fastify inject + :memory: sqlite)
pnpm test:e2e               # Playwright (auto-starts API + UI); first run: pnpm --filter @game-hub/ui exec playwright install chromium
pnpm typecheck              # strict typecheck across all packages
pnpm bench                  # dev-only bot-strength harness (win rate + Wilson CI)

# Lint & format (ESLint 9 flat config + Prettier — both run in CI after typecheck)
pnpm lint                   # real hazards only (NOT a second typecheck)
pnpm format                 # Prettier --write .   (single quotes, semicolons, trailing commas, width 120)
pnpm format:check           # the CI gate (*.md is Prettier-ignored — hand-wrap docs to ~100-120 cols)

pnpm generate               # games.config.ts → the two checked-in registries (CI freshness-checks the diff)

# Publish-readiness of the two published packages (CI runs both after `pnpm test`)
pnpm --filter @game-hub/kernel pack:smoke   # pack → install outside the workspace → node + nodenext tsc
pnpm --filter @game-hub/ui-kit pack:smoke   # same, for the chrome (deps declared, React stays a peer)

# The published kernel (Track D / D2a — @game-hub/kernel is the one package that leaves this repo)
pnpm --filter @game-hub/kernel build       # tsc → dist/ (JS + .d.ts + maps); also runs as `prepack`
pnpm --filter @game-hub/kernel pack:smoke  # pack → install outside the workspace → node + tsc drive it (CI runs this)

# Dev (two terminals)
pnpm dev:backend            # API on :3001
pnpm dev:ui                 # UI on :5173 (proxies /api → :3001)

# Production image (single image serves UI + API on one port; SQLite on a volume)
docker build -t game-hub:latest .
docker run -d -p 8080:3001 -v game-hub-game-data:/data game-hub:latest   # → http://host:8080
```

**Deployment:** a multi-stage `Dockerfile` builds the UI + native SQLite and **esbuild-bundles** the
backend (inlining the workspace TS deps — `@game-hub/kernel` and the game packages — since they ship `.ts`
source), producing a slim Node runtime image (no tsx/vite/vitest, runs as unprivileged `node`, in-image
`HEALTHCHECK`, boot-proven by `backend/scripts/smoke.mjs`). Games persist to `DATABASE_PATH`
(default `/data/game-hub.sqlite`) — mount `/data` to a volume. No auth (trusted-LAN use). See
[`DEPLOY.md`](./DEPLOY.md). ⚠️ When adding a top-level API route, update the SPA-fallback allowlist regex
in `app.ts` (`/^\/(games|lobbies|health)\b/`).

## Testing strategy (summary — full detail in design-patterns §9)

- **Engine:** exhaustive unit tests, 100% gate per game — the primary correctness guarantee.
- **Backend:** integration tests via `app.inject` against `:memory:` SQLite. ⚠️ `module-seam.test.ts`
  drives a stub *counter* game through the core — the only honest test that the core hosts games, plural;
  keep it green.
- **UI:** Playwright e2e + a responsive spec (reflow + no 320px overflow) + visual baselines. ⚠️ Runs at
  `workers: 4` deliberately (higher resets Vite's dev WS proxy and flakes specs — a dev-server limit).
  Testids are stable contracts.

## Decisions & assumptions log (still-operative)

- **Package manager is pnpm** (installed via Homebrew — corepack couldn't symlink into `/usr/local/bin`).
  Native `better-sqlite3` and `esbuild` builds are allow-listed in `pnpm-workspace.yaml`.
- **Container colours:** `white, red, green, blue, yellow` (container cargo, from the rulebook scoring
  cards). *Player* colours are a separate per-game palette the module declares (design-patterns §2).
- **Produce is "as many as you are able to"** (Container rulebook pg. 9) — an idle factory shrinks the run
  rather than blocking it; only when *every* factory colour is exhausted does Produce throw `OUT_OF_SUPPLY`.
- **Stone Age caps population and the food track at 10** (`MAX_PEOPLE`/`MAX_FOOD_TRACK`) — the rulebook's
  physical caps; the engine clamps the *gain* while placement stays legal as a blocking move.
- **Reference PDFs stay gitignored** (copyright) — local-only; cite page numbers in comments instead.
- **v1 was hotseat / pass-and-play.** Online multiplayer (lobbies, live sync, seat identity, resume) and
  AI both shipped; hotseat still works and its testids are intact.
- All five games are persisted-state **shape-v1** (no `schemaVersion` declared).
- **`@game-hub/kernel`'s major version IS the host↔game contract version** (Track D / D2a). It exports
  `KERNEL_CONTRACT_VERSION` (= 1); every module declares `kernelContract: KERNEL_CONTRACT_VERSION` and
  `GameRegistry.register` boot-crashes on a mismatch. Additive optional hooks = minor; a changed required
  member = major. An undeclared `kernelContract` means 1 **only during this transition** — make it
  required when a contract 2 lands. Full rule: `packages/kernel/src/contract.ts` + design doc §4.
- ⚠️ **Shipped kernel files write relative imports with an explicit `.js` extension.** The kernel is the
  one package that leaves this repo, and `tsc` emits relative specifiers verbatim — extensionless ones
  make the installed tarball unloadable by Node while every in-repo suite stays green. `pack:smoke` is
  what catches it. Same rule applies to any game package that later ships a `dist`.

Older decision detail (Track A/B/C/D slice history) lives in `ROADMAP.md` and the per-game roadmaps.

## Working agreement for Claude

- When implementing a mechanic, **read the relevant rulebook page first**; cite it in a comment.
- Never let a game's engine coverage drop below 100% (or its bot below 90%). Add tests with the code.
- Keep the engine pure. If you need I/O or randomness, it belongs in backend/ui or is injected.
- Prefer extending the established patterns (typed errors, immutable state, testids, the seam rules in
  `docs/design-patterns.md`) over inventing new ones. Respect the ⚠️ hazard notes.
- **Verify before claiming it works** — drive the real thing (browser, container, CLI), don't infer from
  green tests. Say so plainly if you didn't verify.
- **Surface problems, don't route around them** — a wrong rule or bad assumption (including in existing
  code) is worth flagging, not quietly working around.
- **Keep this file, the roadmaps, and the docs current as decisions land**, not in a later cleanup pass.
  A decision that isn't written down didn't happen.
- Commit at working checkpoints (green tests, feature coherent). Don't commit or push unless asked.
