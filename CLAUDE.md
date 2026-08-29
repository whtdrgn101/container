# CLAUDE.md — Game Hub (self-hosted board-game platform)

Context and working agreement for this repo. Read this first, then the two reference docs it points to.

## What we're building

**Game Hub** — a self-hosted board-game platform (a "games room") that hosts *multiple* games behind
shared engine/backend/UI seams. Each game is its own package. As of 2026-07-31 **all games are built
in their own repositories** (`whtdrgn101/game-<id>`) and installed here like any npm dependency —
published to the public registry and consumed as `@game-hub/game-*@^0.1.0` over compiled
`dist/`. Nothing under `packages/games/` remains; the hub is a pure *host*. The platform is game-agnostic.
The games (each links its own repo):

| Game | Players | Kind | Status |
|------|---------|------|--------|
| **Container** (10th Anniv.) — [`whtdrgn101/game-container`](https://github.com/whtdrgn101/game-container) | 3–5 | economic supply-chain — you can never buy/ship *your own* containers | core game complete; AI A0–A2 shipped (A3–A5 optional) |
| **Can't Stop** — [`whtdrgn101/game-cantstop`](https://github.com/whtdrgn101/game-cantstop) | 2–4 | push-your-luck dice | complete + bot (CS1) + difficulty tiers (CS4); only variants (CS3) remain |
| **Stone Age** — [`whtdrgn101/game-stoneage`](https://github.com/whtdrgn101/game-stoneage) | 2–4 | worker-placement Euro | **complete** (SA0–SA15): full game, illustrated board, bot, 2–3-player rules, deck redaction |
| **Saint Petersburg** (1st ed.) — [`whtdrgn101/game-stpetersburg`](https://github.com/whtdrgn101/game-stpetersburg) | 2–4 | card-buying engine | **complete** (SP0–SP9): first game with real hidden info (hand + rubles secret) |
| **Russian Railroads** (Ultimate ed.) — [`whtdrgn101/game-russianrailroads`](https://github.com/whtdrgn101/game-russianrailroads) | 2–4 | worker-placement | **in build** — base game + art (RR9) complete; board-UI revamp (RR9b) queued behind the Labyrinth kickoff (it should borrow Labyrinth's board-UI findings); bot (RR10) after; the Track D **package pilot** |
| **Labyrinth** (Ravensburger) — [`whtdrgn101/game-labyrinth`](https://github.com/whtdrgn101/game-labyrinth) | 2–4 | sliding-maze race, hidden treasure targets | **playable — the Track D D2 proof**: game 6, the *first* built out-of-repo against published `@game-hub/*`. L0–L4 shipped; L4b (art) + L5 (bot) remain |
| **Argute** (Indipro) — [`whtdrgn101/game-argute`](https://github.com/whtdrgn101/game-argute) | **2–7** | suitless trick-taking, secret bids, wooden pegboard | **complete** (A0–A6): game 7, the first built from `whtdrgn101/game-template` rather than extracted from here. Widest table the hub hosts. ⚠️ Its rules have **no published PDF** — the repo's `ROADMAP.md` §1 digest is the citable spec and §3 carries numbered rulings R1–R13 |

Per-game rules and slice history now live **in each game's own repo** (`ROADMAP.md`, `CLAUDE.md`, and —
for Labyrinth — `docs/d2c-findings.md`), not in this repo. The authoritative rules are the rulebook PDFs
in `reference_materials/` (gitignored — copyrighted) — **except Argute, which has no published PDF**; its
repo's `ROADMAP.md` §1 digest is the citable spec and §3 the numbered rulings. ⚠️ **Read the spec before
implementing a rule** — never from memory.

**Naming split:** the **platform** is "Game Hub" (npm scope `@game-hub/*`). **Container** is one game *on*
it (id `container`), not the platform. Don't conflate them.

## Non-negotiables (set at kickoff, still binding)

- **100% unit-test coverage of every game engine** (rules), enforced per game by a `src/engine/**`
  coverage gate. The bot gate is **90%** (heuristics shouldn't fight a 100% bar). Since 2026-07-31 every
  game lives in its own repo, so these gates run in **that** repo's CI — the platform can't enforce them
  on an installed package, but the discipline is still the contract every game owes the hub.
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
                     primitives (GameError, MoveRecord, Viewer, record, makeSeating, GameEndState,
                     shuffle/mulberry32), runBotLoop, the GameModule/GameClient contracts (host
                     bindings are generics), the transport DTOs (GamePayload/GameMessage), the platform
                     envelopes (chat/presence DTOs + guards) and optional GameClient.icon, and the
                     @game-hub/kernel/{client,bot} subpaths. Its own 100% gate.
                     Published through **1.5.0** (1.2.0 = the colour channel + rng helpers; 1.3.0 = the
                     typed chat/presence envelopes + GameClient.icon; 1.4.0 = the typed move log +
                     GameClient.version; 1.5.0 = table options — see contract.ts's version history).
  ui-kit/          @game-hub/ui-kit — the shared board chrome every game's UI renders inside
                     (TurnBanner, ActivityFeed, GameOver, ActionTip, PanZoom, Button/Card, cn,
                     seatIdentity) + the game-facing REST calls (getGame/applyAction/apiUrl).
                     React is a peer; no CSS ships (Tailwind classes in source). Published (1.0.0).
  bench/           @game-hub/bench — dev-only bot-strength harness (root `pnpm bench`)
backend/           @game-hub/backend — game-agnostic Fastify REST core + SQLite + the generated registry
ui/                @game-hub/ui — game-agnostic React + Tailwind + shadcn shell + the generated registry.
                     Its front door is the **Card Table** (2026-07-31): a shelf of box-lid cards (each a
                     game's own `client.Icon`, sorted by name) → a per-game detail screen (Pass and play /
                     Play online) → a felt "Open tables" band, under a Footer whose one link is the About
                     screen. `shell/`: Shelf, GameDetail, GameIcon, OpenTables, Header, WaitingRoom,
                     ChatPanel, Footer, About. Identity lives in `index.css` theme tokens (and, for the
                     tab, `ui/public/favicon.svg` — the header's brass dice mark, palette hardcoded because
                     a favicon can't see them); ui-kit untouched.
games.config.ts    the ordered list of hosted games → `pnpm generate` → the two checked-in registries

The games themselves live OUTSIDE this repo (each `whtdrgn101/game-<id>`, published to npm), consumed here
as `@game-hub/game-*@^0.1.0` — an installed package whose four subpath exports resolve to compiled `dist/`:
  ./engine (pure rules)  ./module (backend seam)  ./client (UI seam)  ./bot (AI).
⚠️ A ./client may import ONLY @game-hub/kernel/client + @game-hub/ui-kit — never ui/src. That seam, and
the engine 100% / bot 90% coverage gates, are enforced in each game's OWN repo/CI now, not here.
```

**Data flow:** UI → REST → backend → **module → engine** (authoritative) → SQLite snapshot + move log.
The backend then **pushes** new state to every client over a push-only WebSocket, each projected
per-viewer via the module's `viewFor`. Adding a game is **additive** and now *always* the out-of-repo
shape: publish the `@game-hub/game-<id>` package, add two dependency lines (backend + ui) and one
`games.config.ts` entry, `pnpm generate` — with **no** Vite alias, tsconfig include or vitest inline
entry, because a dist consumer is just a dependency (`docs/game-creation.md` §6, the only path now).
⚠️ Two host settings make that work and must not be reverted — `linkWorkspacePackages: true`
(`pnpm-workspace.yaml`) and `optimizeDeps.exclude: ['@game-hub/kernel', '@game-hub/ui-kit']`
(`ui/vite.config.ts`); both stop a **second copy** of a shared package reaching the installed game, which
breaks module-identity singletons (the injected REST base URL, React context) silently. Each has a
measured note where it lives.

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
**[`ROADMAP.md`](./ROADMAP.md)**; per-game roadmaps now live in each game's own repo. The 2026-07
architecture review (`REVIEW.md`) is **retired** — its remaining items live in ROADMAP.md's
"Review backlog" section (full text in git history; code comments citing "REVIEW §x.y" refer to it).
Deployment: **[`DEPLOY.md`](./DEPLOY.md)**.

## Commands

```bash
pnpm install                # bootstrap the workspace

# Tests
pnpm test                   # every workspace's tests (pnpm -r test) — kernel + backend (the games'
                            #   engine 100% / bot 90% gates run in each game's OWN repo/CI now)
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
backend (inlining `@game-hub/kernel` — a workspace TS dep shipping `.ts` source — plus the seven installed
games' already-compiled `dist/` JS from `node_modules`), producing a slim Node runtime image (no
tsx/vite/vitest, runs as unprivileged `node`, in-image
`HEALTHCHECK`, boot-proven by `backend/scripts/smoke.mjs`). Games persist to `DATABASE_PATH`
(default `/data/game-hub.sqlite`) — mount `/data` to a volume. No auth (trusted-LAN use). See
[`DEPLOY.md`](./DEPLOY.md). ⚠️ When adding a top-level API route, update the SPA-fallback allowlist regex
in `backend/src/routes/static.ts` (`/^\/(games|lobbies|health)\b/`). (`app.ts` was split 2026-07-31 into a
thin composition root + per-concern registrars under `backend/src/routes/`; the shared repositories and
helpers live in `backend/src/services.ts`.)

## Testing strategy (summary — full detail in design-patterns §9)

- **Engine:** exhaustive unit tests, 100% gate per game — the primary correctness guarantee, now run in
  each game's own repo/CI (the games install here as compiled `dist/`).
- **Backend:** integration tests via `app.inject` against `:memory:` SQLite. ⚠️ `module-seam.test.ts`
  drives a stub *counter* game through the core — the only honest test that the core hosts games, plural;
  keep it green.
- **UI:** Playwright e2e + a responsive spec (reflow + no 320px overflow) + visual baselines. ⚠️ Runs at
  `workers: 4` deliberately (higher resets Vite's dev WS proxy and flakes specs — a dev-server limit).
  Testids are stable contracts.

## Decisions & assumptions log (still-operative)

- **All six games are out-of-repo, installed from npm** (2026-07-31). The five in-workspace games
  (`packages/games/*`) were extracted to their own repositories (`whtdrgn101/game-<id>`) and published to
  the public registry alongside Labyrinth; every game now installs as `@game-hub/game-*@^0.1.0` over
  compiled `dist/`. `packages/games/`, `vendor/` and the `labyrinth:refresh`/`test:games` scripts are
  gone; Labyrinth's publish retired the vendored-tarball loop. The hub keeps only `@game-hub/kernel` +
  `@game-hub/ui-kit` as workspace source. The five per-game Vite aliases and tsconfig includes are gone
  (Labyrinth never had them — that was the proof they were unneeded). ⚠️ The backend vitest
  `deps.inline` **still lists `game-`** even though the games ship dist: each game's dist imports the
  *workspace TS-source* kernel, so the whole `@game-hub/*` subtree must go through Vite's transform (see
  the note in `backend/vitest.config.ts`).
- **Argute is game 7, and the first built _from the template_** (2026-08-06). Every earlier game was
  either extracted from this workspace or (Labyrinth) hand-built out-of-repo; Argute was created from
  `whtdrgn101/game-template` and added here the routine way — two dependency lines, one `games.config.ts`
  entry, `pnpm generate`. Nothing else was needed, which is the result Track D was aiming at. Three things
  it established:
  - **7 seats.** Every game before it stopped at 5. Nothing platform-side had to change —
    `MAX_SEATS` was already 8 — but a module may now declare a **seven**-colour palette, and the shell's
    `SWATCH` fallback (unknown id used as a raw CSS colour) is what lets `orange`/`white`/`black` render.
  - ⚠️ **A game may have no published rulebook PDF.** Argute's rules ship as three cards in the box, so
    the usual "cite the page" discipline has no page to cite. The pattern that replaced it: the game
    repo's `ROADMAP.md` §1 rules digest **is** the citable spec (code cites `ROADMAP §1`), and every gap
    the source leaves open is a numbered ruling in §3 cited as `ruling R<n>`. Nothing is implemented from
    an undocumented guess. `reference_materials/README.md` records the sourcing.
  - ⚠️ **Publish a game with `pnpm publish`, never `npm publish`.** npm ignores `publishConfig.exports`
    and ships a dist-only tarball whose exports still point at `./src/*.ts` — it installs and then
    resolves no subpath, which is how Labyrinth 0.1.2 broke. `pack:smoke` cannot catch it (it packs with
    `pnpm pack`, which *does* apply the override). Argute had to copy the guard from Labyrinth by hand,
    which is what prompted **fixing the template**: `scripts/assert-pnpm-publish.mjs` + `prepublishOnly`
    now ship in `whtdrgn101/game-template` (2026-08-06), so every game scaffolded from it is protected.
    Only a game started from an older copy needs the guard copied in.
- ⚠️ **Table options are rules data, and the one exception to "coordination state lives outside the
  engine"** (kernel 1.5.0, 2026-08-28). A game may declare `tableOptions` — rule variants a table agrees
  *before* the deal (Euchre's stick-the-dealer, Spades' blind nil and target score). Mechanically it
  mirrors `botDifficulties`: the module declares opaque specs, the host validates and publishes them on
  `/games/catalog`, and `ui/src/shell/TableOptions.tsx` renders a "House rules" section that names no
  option and no game. But unlike bots/colours/rematch the resolved record reaches `createGame`, because
  an option **is** a rule — the game folds it into its own state at setup, so it replays, persists and
  migrates as ordinary rule data and no host stores it twice. A lobby fixes its options when the room is
  **opened**, not at start. Only `boolean` and `choice` exist; there is deliberately no free-number type
  (design-patterns §2). Validation lives in the kernel (`resolveTableOptions`) so a second host and a
  game's own tests can't disagree with the platform about what a legal pick is. All seven games that
  predate it declare nothing, put no key on the wire, and were untouched by the bump.
- **Package manager is pnpm** (installed via Homebrew — corepack couldn't symlink into `/usr/local/bin`).
  Native `better-sqlite3` and `esbuild` builds are allow-listed in `pnpm-workspace.yaml`.
- **Container colours:** `white, red, green, blue, yellow` (container cargo, from the rulebook scoring
  cards). *Player* colours are a separate per-game palette the module declares (design-patterns §2).
- **The Card Table shell redesign** (2026-07-31): the shell has one coherent board-game-room identity —
  felt `#2e5d45` / cream `#f4ecdc` / brass `#b98a2f` / wood `#7a5232` / ink `#2a241c`, serif display
  headings. It's applied as **Tailwind v4 theme tokens** in `ui/src/index.css`, with the five named colours
  also **mapped onto the semantic tokens** (`--primary`, `--card`, `--foreground`, …) so the published
  `@game-hub/ui-kit` chrome adopts the palette **without touching ui-kit** (remap, not restyle). Landing =
  a shelf of box lids (each game's lazy `client.Icon`, from `GameClient.Icon` / games `0.1.1`); a lid opens
  a detail screen with two separated actions (**Pass and play** = hotseat form, **Play online** = shared
  lobby); resume/waiting lists are a felt "Open tables" band. Every prior capability is preserved. ⚠️ The
  board-map visual baselines are **image-generated** — a host-run diff (Pop!_OS fonts ≠ jammy) is not a
  real failure; the boards are untouched and the pinned CI image (`playwright:v1.61.1-jammy`) passes with
  the committed baselines. ⚠️ Never `docker run` the repo with `node_modules` mounted as **root** — a
  container-side `pnpm install` corrupts the host `.bin`/store (root-owned); if it happens, `chown` back
  and clean-reinstall.
- ⚠️ **The About screen's privacy copy is a factual claim, not marketing** (2026-08-07). `ui/src/shell/About.tsx`
  tells players there are no accounts, no personal data beyond a table's own state and the names typed at
  it, and no analytics or third-party scripts. That is true of the code today; if a login, a tracker or a
  hosted dependency ever lands, **the copy changes in the same commit**. About is an overlay screen (it
  opens over whatever you were doing), which is why it sits outside `App.tsx`'s screen cascade.
- **A player colour may be rules data** (kernel 1.2.0, 2026-07-30): every seat's resolved colour is passed
  to `createGame` as `players[].color`. All five hosted games ignore it — for them a colour is still
  presentation and stays coordination state — but a game where the pick *is* a rule (Labyrinth's starting
  corner) can read it. Bots and difficulty tiers stay strictly out of the engine; colour is the exception.
- **Produce is "as many as you are able to"** (Container rulebook pg. 9) — an idle factory shrinks the run
  rather than blocking it; only when *every* factory colour is exhausted does Produce throw `OUT_OF_SUPPLY`.
- **Stone Age caps population and the food track at 10** (`MAX_PEOPLE`/`MAX_FOOD_TRACK`) — the rulebook's
  physical caps; the engine clamps the *gain* while placement stays legal as a blocking move.
- **Reference PDFs stay gitignored** (copyright) — local-only; cite page numbers in comments instead.
- **v1 was hotseat / pass-and-play.** Online multiplayer (lobbies, live sync, seat identity, resume) and
  AI both shipped; hotseat still works and its testids are intact.
- All seven games are persisted-state **shape-v1** (no `schemaVersion` declared).
- **`@game-hub/kernel`'s major version IS the host↔game contract version** (Track D / D2a). It exports
  `KERNEL_CONTRACT_VERSION` (= 1); every module declares `kernelContract: KERNEL_CONTRACT_VERSION` and
  `GameRegistry.register` boot-crashes on a mismatch. Additive optional hooks = minor; a changed required
  member = major. An undeclared `kernelContract` means 1 **only during this transition** — make it
  required when a contract 2 lands. Full rule: `packages/kernel/src/contract.ts` + design doc §4.
- ⚠️ **Files in a package that ships a `dist` write relative imports with an explicit `.js` extension.**
  `tsc` emits relative specifiers verbatim, and Node ESM does neither extension nor directory
  resolution — an extensionless `from './errors'` makes the installed tarball unloadable while every
  in-repo suite stays green. `pack:smoke` is what catches it. Applies to `@game-hub/kernel`,
  `@game-hub/ui-kit`, and all seven out-of-repo game packages (each carries its own pack smoke).

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
