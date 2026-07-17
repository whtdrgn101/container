# CLAUDE.md — Game Hub (self-hosted board-game platform)

Context and working agreement for this repo. Read this first.

## What we're building

**Game Hub** — a self-hosted board-game platform (a "games room") that hosts *multiple* games behind
shared engine/backend/UI seams. Two games are built on it today:

- **Container** (10th Anniversary Edition) — the first game; a 3–5 player economic supply-chain game.
- **Can't Stop** — the second game; a 2–4 player push-your-luck dice game (added as roadmap C3, the
  honest test that the platform seams generalize).

This is a learning project: the owner is an experienced software engineer who wants **good engineering
practices** throughout — clean separation of concerns, strong typing, and high test coverage. Note the
naming split: the **platform** is "Game Hub" (the npm scope is `@game-hub/*`); **Container** is one game
*on* it (id `container`, under `games/container/`), not the platform itself. Don't conflate them.

Non-negotiables set at kickoff:

- **100% unit-test coverage of each game engine** (mechanics). Enforced by a coverage gate.
- The UI has automated tests via **Playwright**, including **responsive regression** tests
  from desktop down to mobile widths.
- Monorepo with separate `ui/` and `backend/` (plus a shared `engine/`), each organized per-game.

## The games — Container (rules summary)

Authoritative source: `reference_materials/Container_Rulebook_v8.pdf` (20 pages). Read it
before implementing any mechanic — do not implement rules from memory.

Container is an economic supply-chain game for **3–5 players**. The twist: **you can never
buy or ship your own containers** — you must entice opponents to buy and deliver yours.

- **Five container colors:** `white`, `red`, `green`, `blue`, `yellow` (confirmed from the
  scoring-card art; orange/purple etc. are *player* colors, not container colors).
- **Board:** each player has a **factory district** (produce containers) and a **harbor
  district** (resell containers). Central boards: **Container Island** (delivery auctions →
  scoring) and the **Off-Shore Bank** (loans + auctions).
- **Turn = 3 steps:** (1) pay $1 loan interest per loan, (2) win any Bank auction you're
  leading, (3) **take 2 actions**.
- **Actions:** Build, Produce, Factory Purchase, Harbor Purchase, Sail, Reprice, Call Bank.
  Plus free "anchor" actions when a ship docks/arrives.
- **The chain:** Produce (factory) → sell to an opponent's **harbor** (Factory Purchase) →
  opponent's ship buys from a harbor (Harbor Purchase) → **Sail** to Container Island →
  **delivery auction** (highest secret bid wins; deliverer earns the bid **plus** a matching
  government subsidy). Bluff ($0) cards allowed.
- **Scoring:** each player has a **secret scoring card** valuing colors differently; game ends
  when the supply runs out of any **2 colors**. Final scoring discards your most-common island
  color, scores the rest by your card, adds leftover-container value, and repays loans.

A fuller mechanic-by-mechanic breakdown lives in the rulebook; capture edge cases as tests.

## Architecture

```
container/
├── engine/     @game-hub/engine  — pure, deterministic rules cores (NO I/O, NO randomness)
│   └── src/                        — a per-game platform, mirroring the backend/UI:
│       ├── kernel/                 — the tiny shared kernel: GameError, MoveRecord, Viewer
│       └── games/                  — one folder per game (container/, cantstop/), each its own
│                                     subpath export `@game-hub/engine/<game>`
├── bot/        @game-hub/bot     — AI players; pure policies over a redacted GameView (Container)
├── backend/    @game-hub/backend — Fastify REST API; persists to SQLite; runs the AI (BotRunner)
│   └── src/games/                 — the GameModule seam: module.ts (contract), registry.ts,
│                                    container/ + cantstop/ (each a registered game)
├── ui/         @game-hub/ui      — React + Tailwind + shadcn; talks to the API
│   └── src/
│       ├── App.tsx                — the Game Hub shell: routing + seat binding (knows no game)
│       ├── shell/                 — Header, Landing, WaitingRoom (generic)
│       ├── hooks/                 — useGameTransport (one socket), useHomeLists
│       ├── lib/api.ts             — the platform API client (generic)
│       └── games/                 — the GameClient seam: types.ts, registry.ts,
│                                    container/ + cantstop/ (board + its own api.ts)
└── reference_materials/           — the rulebook PDFs (Container, Can't Stop)
```

**Data flow:** UI → REST → backend → **engine** (authoritative) → SQLite snapshot + move log.
Moves always go over REST; the backend then **pushes** the new state to all connected clients over a
WebSocket (`GameHub`), each projected per-viewer via `viewFor`. The socket is push-only (never a move channel).

**Coordination state lives outside the engine.** Anything that is *not* a rule — pre-game lobbies
(`lobbies.ts`), pending delivery auctions (`games/container/auctions.ts`), and which seats are bots
(`bots.ts`) — is backend state with its own table and its own per-viewer projection. The engine stays a
pure `state + action → state` library that knows nothing about rooms, sealed bids, or bots. Reach for
this pattern before reaching into the engine.

### The `GameModule` seam (Track C / C0 + C1)

The backend hosts **games**, plural, through one contract: `backend/src/games/module.ts`. Container is
one registered module (`games/container/`), not the only thing the server can do — and since C1 that is
literal: two games can run side by side on one server, proven by `tests/module-seam.test.ts`.

- **`games.game_type` says whose rules a row plays by.** A game's state is an opaque blob, so this
  column is the only thing tying it to an engine. **Every route resolves its module from the row**
  (`moduleOf(gameId)`), never from a default — that's what keeps state and rules together. Adding a
  game is registering it; there is no other switch to flip.
- **A game's own endpoints live under `/games/:id/<gameType>/…`** (Container's auction is
  `/games/:id/container/auction`). A module declares paths *relative* to that. This is about
  correctness, not tidiness: unprefixed, two games both wanting `/auction` is a boot crash, and
  whichever registered first would be handed **every** game's requests. A scope guard also refuses any
  row that isn't that module's type (`WRONG_GAME_TYPE`), because a prefix is just a URL anyone can type.
- **Seat ranges, action types, errors and bots are all the module's** — `POST /lobbies {gameType}`
  validates against *that game's* min/max, not a constant.
- **`GameHub` is game-agnostic**: it fans out per-viewer messages and projects nothing itself, so
  redaction stays an explicit decision made by code that knows the game.
- **An unregistered `game_type`** (a module pulled while its rows remain) is `409 GAME_TYPE_UNAVAILABLE`,
  and such rows are skipped by `GET /games` rather than taking the home screen down.

- **The core is game-agnostic; the module owns every rule-shaped decision.** `app.ts` and
  `repository.ts` contain no Container-specific code and read **no field off a game state** — id,
  version, move log, summary and projection all come from the module. **When adding backend behaviour,
  ask which side it belongs on.** If it needs to know what a container or a bid is, it goes in
  `games/container/`.
- **`games/module.ts` must never import a game.** It is the contract. `registry.ts` is the lookup.
- **A game's own weirdness goes behind `routes` / `pendingStep` / `onStateChanged` / `createBotDriver`**,
  not into the core. Container's delivery auction is the whole reason those hooks exist. We deliberately
  did **not** build a generic sealed-bid framework off one example — if a second game needs the same
  shape, extract it *then*.
- **`POST /games/:id/actions` takes opaque JSON.** Fastify validates only `{ playerId, action: object }`;
  **all** action validation is `module.parseAction`. Don't re-add a `type` enum to the route — that's the
  thing that couldn't survive a second game.
- **Randomness is injected**, never reached for inside a module — at setup (`createGame({ rng })`) and,
  since C3, **per action** via `ModuleContext.rng` (Can't Stop's dice roll route draws from it and
  applies a pure engine action carrying the result). That's what keeps every engine pure, deterministic
  and replayable. A module reaching for `Math.random` is the bug this prevents.
### The `GameClient` seam — the UI side (Track C / C2)

The UI mirrors the backend split. `App.tsx` is the **Game Hub shell**: landing, lobby, navigation,
seat binding, and the transport. A game plugs in a **board**; the shell renders it and never reads a
game's state.

- **⚠️ Nothing outside `ui/src/games/<game>/` may import `@game-hub/engine`** — and
  `e2e/architecture.spec.ts` fails the build if it does. This is the rule most likely to be undone by
  accident (someone needs `COLORS` in a shell file, adds one import, and the games room is quietly a
  Container app again). If shell code seems to need a rule, a colour, a piece or a seat count, the
  need belongs on the other side: **seat bounds come from `GET /games/catalog`**, not `MIN_PLAYERS`.
- **Only `games/registry.ts` may name a specific game.** Also enforced by that spec.
- **`unknown` at the seam, never inside a board.** `lib/api.ts` is generic in `S`
  (`getGame<GameView>(…)`); `games/container/api.ts` pins the types back, so the board is fully typed.
  Don't widen a board's props to `unknown` to make a call type-check — pass the type parameter.
  There is **exactly one cast**, at registration in `registry.ts`; TypeScript can't type a
  heterogeneous list of `GameClient<S>` (React props are contravariant, so the backend's
  method-bivariance trick doesn't apply). What makes it sound: `gameType` picks the client, so a board
  only ever gets a state its own game produced.
- **The shell owns the socket; the board owns its side-channels.** `useGameTransport` handles
  `type: 'state'` and hands every other frame back as `lastMessage` for the board to interpret
  (Container reads `type: 'auction'`). `subscribeGame` used to take an `onAuction` callback typed
  against Container — don't put a game's concept back into the transport.
- **The header's status line is a plugin slot** (`GameClient.Status`), because "2 actions left" is a
  Container rule. Keep `Status` cheap and non-lazy: it renders before the board chunk lands.
- **The board is lazy** (`lazy(() => import('./Board'))`) and must stay that way — it's a real 41 kB
  chunk carrying the engine, the panels and the art, and the hub's landing screen ships none of it.
  Importing the board (or anything heavy) from `games/container/index.ts` would silently undo that.
- **Every game payload carries `gameType`** (`{ game, gameType, bots }`, plus the WS state push), which
  is how the shell picks a board for a state it just fetched. A new route returning game state must
  include it.

- **The honest test is `tests/module-seam.test.ts`**, which drives a stub *counter* game through the core.
  Container's own tests pass fine even if the core is secretly hardcoded to Container — only a second
  game can tell. Keep that file working; it's the thing that caught the repository reading `state.version`.

The **engine is the single source of truth** for rules. It is a pure function library:
`state + action → new state` (or throws a typed `GameError`). It has no dates, no random,
no network, no DB. Randomness (e.g. dealing factory colors / scoring cards) is injected by
callers so the engine stays deterministic and trivially testable. This is what makes the
100% coverage gate achievable and keeps the door open for **online multiplayer** and **AI
opponents** later (both just drive the same engine).

### How the shared engine is consumed

`@game-hub/engine` exports **TypeScript source** (not a build), and is a **per-game platform**:
there is deliberately **no `.` entry**. Consumers import a specific game's surface by subpath —
`@game-hub/engine/container`, `@game-hub/engine/cantstop` — over a tiny shared
`@game-hub/engine/kernel`. No game is a privileged default, mirroring the backend rule "resolve the
module from the row, never a default". Both consumers transpile the TS source directly:

- **backend** — `tsx` (dev/prod-start) and Vitest (`server.deps.inline: [/@game-hub\/engine/]`)
  transform the TS source across the workspace boundary; the subpath `exports` map resolves each game.
- **ui** — `vite.config.ts` has **one alias per subpath** (`/container`, `/cantstop`, `/kernel`) →
  the matching `engine/src/…` file, so Vite bundles it as project source. This also gives the
  **frontend shared types** (`CantStopState`, `Color`, …) for free.

`engine` also has a real `build` (`tsc -p tsconfig.build.json` → `dist/`) used for typecheck/
distribution; consumers may switch to `dist` later if we ever publish.

**The kernel is tiny on purpose** (`engine/src/kernel/`): only `GameError` (generic in its code
union), `MoveRecord`, and `Viewer` — the primitives every game *and* the backend `GameModule` contract
share. Each game keeps its **own** `record()`, state types, constants and `viewFor`. We did **not**
extract a shared `record`/state off two examples — same discipline as not building a sealed-bid
framework off one. If a third game makes a shape genuinely common, extract it *then*.

### The bot package (`@game-hub/bot`, per-game like the engine)

**Engine = rules, bot = opinions.** The engine says what is *legal*; the bot only says what is *wise*.
No bot code goes in `engine/`, and the engine must never learn what a bot is. A bot is not
authoritative — it just produces an `Action` that the engine validates like any human's move.

- **Per-game, like the engine and backend.** `bot/src/games/<game>/` (Container, Can't Stop) over a tiny
  `bot/src/kernel/` (just `BotError`), exported by **subpath** — `@game-hub/bot/container`,
  `@game-hub/bot/cantstop`, no `.` default. Each game's backend module wires its own bot through
  `createBotDriver`. The bullets below split into a general rule and each game's specifics.
- **Bots decide from a `GameView`, never a `GameState`:** `decide(viewFor(state, botId), botId)`. Taking
  the redacted view makes cheating *structurally impossible* rather than a matter of discipline. For
  Container, `selfOf()` enforces the other half (the bot's own card must be visible). **Can't Stop hides
  nothing**, so its view *is* the whole state and the redaction is a no-op — the shared kernel must not
  assume redaction. **Never hand a bot more than a player's view.**
- **Coverage gate is 90%, not 100%** (deliberate — see `bot/vitest.config.ts`, per game). Heuristic
  weights get retuned constantly, and a 100% bar on judgement calls buys churn, not correctness. What
  must stay covered: every decision is legal, every policy reachable.
- **Layout** mirrors the engine's conventions: Container splits opinions one-per-concern in
  `games/container/policies/`; Can't Stop's whole risk model is `games/cantstop/policy.ts`. Barrels
  re-export only; tests live in `games/<game>/tests/`.
- **⚠️ Randomness the bot can't invent is injected by the caller** — Container's `collectBids` (sealed
  opponent bids), Can't Stop's `rollDice` (server-side dice, since the bot can't roll). `decide` throws a
  `BotError` if the caller didn't supply it. Self-play seeds it; the backend runner fills it from `ctx.rng`.
- **Container specifics:** `legalActions` returns 5 of 12 actions as bare *markers* `applyAction` throws
  on — completing them is `rank()`'s job and *is* the strategy; and value containers with `gainFrom`,
  never `card.values[color]` (the discard rule makes marginal value differ from face value, even negative).
- **Self-play (`playSelfPlay`) is each bot's real test** — it drives thousands of live engine actions, so
  any illegal action throws. Keep it passing (Container 3–5 players; Can't Stop 2–4, seeded rng).
- **Greedy bots cannot see multi-action payoffs.** The delivery run is 4+ actions; score long chains
  against the *goal*, not the hop, or ships never leave port (this actually happened — see ROADMAP A0).

### Engine module layout

The engine hosts **one folder per game** under `engine/src/games/<game>/`, over the shared
`engine/src/kernel/`. Each game is organized into small, single-responsibility modules (SRP) with
barrel files; its public API is defined solely by its own `index.ts`, exported as
`@game-hub/engine/<game>`. Consumers import that subpath, never deep paths.

```
engine/src/
  kernel/             # the tiny shared kernel (both games + the backend contract use these)
    errors.ts         # GameError<Code> — generic base class; each game subclasses it
    moveRecord.ts     # MoveRecord (type-only)
    viewer.ts         # Viewer (type-only)
    index.ts
  games/
    container/        # Container — see below; exported as @game-hub/engine/container
    cantstop/         # Can't Stop — the worked second game
      index.ts        # THE game's public API (the only thing consumers import)
      createGame.ts   # game setup (deterministic; Can't Stop needs no setup rng)
      core/           # foundational data/types, no game logic
        constants.ts  errors.ts  types.ts  index.ts
      internal/       # shared helpers (DRY), not part of the public API
        players.ts    # seatOf, activePlayer, withPlayer
        columns.ts    # legalSelections/applySelection — the pairing + must-place rules
        record.ts     # record() — the one place that bumps version + appends to the log
        index.ts
      actions/        # ONE file per action/mechanic + the dispatcher
        action.ts     # the Action union (ROLL is server-only)
        roll.ts  select.ts  stop.ts
        applyAction.ts  # turn-aware dispatcher (the single entry point for a move)
        legalActions.ts # enumerates legal moves (never ROLL — the route owns it)
        index.ts
      tests/          # ONE test file per piece + shared helpers
        helpers.ts    # newGame/makeState/expectError (DRY test fixtures)
        <piece>.test.ts
```

**Conventions (follow these when adding a mechanic to a game):**
- **One mechanic = one file** in that game's `actions/` + **one matching test file** in `tests/`.
  Reuse the game's `internal/` helpers rather than re-implementing (DRY). Never bump `version`/`log`
  outside `record()`.
- **Barrels** (`index.ts`) only re-export; they contain no logic and are excluded from coverage
  (along with type-only files: `games/*/core/types.ts`, `games/*/actions/action.ts`,
  `kernel/moveRecord.ts`, `kernel/viewer.ts`). The **100% gate spans every game** in the package.
- **Keep files small and single-responsibility** — well under any 1000-line linter threshold.
- Within a folder, import siblings by **direct path** (e.g. `applyAction.ts` imports `./roll`), not
  via the folder barrel, to avoid cycles. Import across folders via the barrel (`../core`,
  `../internal`); reach the kernel by relative path (`../../kernel`).
- Adding a new action = new `Action` variant in `action.ts` + a mechanic file + an `applyAction`
  case + a `legalActions` branch + a public export in that game's `index.ts` + a test file.

### Building a new game (the platform recipe)

Container and Can't Stop are two registered games on one platform; a third is **additive**, touching
no shared core. The seams are the same at every layer — engine, backend, UI — and each has an "only
the game knows this" rule. To add a game `foo`:

1. **Engine** — `engine/src/games/foo/` with the layout above; export its surface from
   `index.ts`, add `"./foo": "./src/games/foo/index.ts"` to `engine/package.json`'s `exports`, and a
   matching alias in `ui/vite.config.ts`. Subclass the kernel `GameError` for `foo`'s own error codes.
   **The engine stays pure** — no `Date`, no `Math.random`. Randomness that a *rule* consumes (dice,
   shuffles) comes in as **data**: model it as an action carrying the already-rolled values, or as a
   `createGame` input, so the state function is deterministic and the 100% gate is reachable.
2. **Backend** — `backend/src/games/foo/` implementing `GameModule<State, Action>` (`createGame`,
   `applyAction`, `legalActions`, `viewFor`, `parseAction`, `summarize`, `versionOf`, `movesOf`,
   `mapError`), and `.register(fooModule)` in `games/index.ts`. **`parseAction` accepts only the
   actions a *client* may send.** A game's own endpoints (and any server-only action) go behind
   `routes` under `/games/:id/foo/…` — never into the core, and never re-add a `type` enum to
   `POST /actions`.
   - **Per-turn randomness is injected via `ModuleContext.rng`** (added for Can't Stop's dice). A
     module route rolls from `ctx.rng` and applies a pure engine action carrying the result — the
     client only asks; it can't choose the dice. **Never reach for `Math.random` in a module.**
   - Optional hooks: `pendingStep` (refuse a `/actions` move owned by a flow of yours),
     `onStateChanged` (push a side-channel), `createBotDriver` (AI seats). Can't Stop omits all three.
3. **UI** — `ui/src/games/foo/` implementing `GameClient` (a **lazy** `Board`, a cheap non-lazy
   `Status`, a one-line `blurb` + short `rules` bullets for the landing — C4), its own `api.ts` (pin
   `lib/api.ts`'s generic `unknown` back to `foo`'s view type; put `foo`'s own endpoints here), and
   `cantstopClient`-style registration in `games/registry.ts` (the one cast). Render `foo`'s end screen
   with the shared `components/GameOver` frame so every game ends the same way. **No shell file may
   import `@game-hub/engine/*`** — `e2e/architecture.spec.ts` enforces it. The landing picker activates
   automatically once two games are registered.
4. **Tests** — 100% engine coverage for `foo`; a backend suite that plays it over REST (seed
   `AppOptions.rng` for deterministic rolls) and asserts it coexists with the other games; an
   `e2e/foo.spec.ts` that picks it and plays a turn. Keep every existing suite green.

## Tech stack (and why)

| Layer    | Choice                                   | Why |
|----------|------------------------------------------|-----|
| Mono     | pnpm workspaces                          | first-class workspace deps, strict node_modules |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`) | one language end-to-end; shared engine + types |
| Engine   | plain TS + Vitest (v8 coverage, 100% gate) | pure logic, fastest possible tests |
| Backend  | Fastify 5 + better-sqlite3               | fast, schema validation; synchronous SQLite is simple & plenty for this |
| DB       | SQLite: `games` (JSON snapshot) + `moves` (append-only log) | engine state is serializable; log enables replay/audit |
| UI       | Vite 6 + React 19 + Tailwind v4 + shadcn-style components | modern, fast; shadcn components live in-repo (`src/components/ui`) |
| UI tests | Playwright (Chromium desktop + Pixel 5 mobile) | e2e + responsive regression |

## Conventions

- **Engine purity:** no I/O, no `Date`/`Math.random`, no mutation. Return new state; never
  mutate inputs (there's a test asserting this). All rejections throw `GameError` with a
  stable `GameErrorCode`.
- **Action model:** all moves flow through `applyAction(state, playerId, action)` — the turn-aware
  entry point that enforces turn order and the per-turn action budget (2), then dispatches to pure
  mechanic functions (`produce`, `buildFactory`, `buildWarehouse`, `endTurn`). `legalActions(state)`
  enumerates what the active player may do (drives UI enable/disable and, later, AI search). The
  backend exposes this as `POST /games/:id/actions` with body `{ playerId, action }`; the UI imports
  `legalActions` from the engine and computes availability client-side. Add new moves as `Action`
  variants + a mechanic + a `legalActions` branch.
- **Error mapping:** the API maps `GameErrorCode` → HTTP (`PLAYER_NOT_FOUND` → 404,
  `INVALID_PLAYER_COUNT` → 400, other illegal-move codes like `NOT_YOUR_TURN` / `NO_ACTIONS_REMAINING`
  → 409). Add new codes in the engine, not ad-hoc strings.
- **Immutability + `readonly`** everywhere in engine types.
- **Versioning:** `GameState.version` increments once per applied action; mirrored in the
  `games` table for future optimistic-concurrency checks.
- **Testids:** UI exposes `data-testid` hooks (`start-game`, `board`, `player-card-<id>`,
  `money-<id>`, `store-count-<id>`, `produce-<id>`) — keep these stable; Playwright depends on them.
- **shadcn components** are copied into `ui/src/components/ui` (not a dependency). Extend them
  in place.
- **Test layout:** unit tests live in a `tests/` folder, not colocated beside source — **per game**
  in the engine (`engine/src/games/<game>/tests/`) and per package in the backend
  (`backend/src/tests/`). UI **Playwright specs stay in `ui/e2e/`**. Vitest's
  `include: ['src/**/*.test.ts']` and the coverage excludes (`src/**/tests/**`, barrels, type-only
  files) already match the nested paths, so no config change is needed when adding tests.

## Commands

```bash
pnpm install                # bootstrap the workspace

# Tests
pnpm test                   # every workspace's tests
pnpm test:engine            # engine unit tests + 100% coverage gate
pnpm test:bot               # bot unit tests + self-play games + 90% coverage gate
pnpm test:backend           # backend integration tests (Fastify inject + :memory: sqlite)
pnpm test:e2e               # Playwright (auto-starts API + UI); needs: pnpm --filter @game-hub/ui exec playwright install chromium
pnpm typecheck              # strict typecheck across all packages

# Dev (run both in separate terminals)
pnpm dev:backend            # API on :3001
pnpm dev:ui                 # UI on :5173 (proxies /api → :3001)

# Production image (single image serves UI + API on one port; SQLite on a volume)
docker build -t game-hub:latest .
docker run -d -p 8080:3001 -v game-hub-game-data:/data game-hub:latest  # → http://host:8080
```

## Deployment (home server / Portainer)

A single Docker image serves the built UI **and** the API on one port (`Dockerfile`, multi-stage:
build UI + native SQLite, then a slim Node runtime). The backend serves `ui/dist` as static files when
`UI_DIST` is set and falls back to `index.html` for non-API GETs (SPA); in a production build the UI's
API base is same-origin (`import.meta.env.PROD ? '' : '/api'`), so there's no CORS/proxy. Games persist
to `DATABASE_PATH` (default `/data/game-hub.sqlite`) — mount `/data` to a volume so they survive
restarts/updates. `docker-compose.yml` maps host `8080` → container `3001`; **[`DEPLOY.md`](./DEPLOY.md)**
has Portainer stack instructions. No auth (trusted-LAN use). When adding a top-level API route, update
the `setNotFoundHandler` allowlist regex in `app.ts` (`/^\/(games|lobbies|health)\b/`) so it isn't
swallowed by the SPA fallback.

## Testing strategy

- **Engine:** exhaustive unit tests; **100% statements/branches/functions/lines** enforced in
  `engine/vitest.config.ts`. Every rule and every rejection path gets a test. This is the
  primary correctness guarantee.
- **Backend:** integration tests via `app.inject` against an in-memory SQLite DB — covers HTTP
  contract, validation, persistence, and error mapping.
- **Playwright runs at `workers: 4`, deliberately.** The default (6 × 2 projects) resets **Vite's dev
  WS proxy** under load, which strands a page without live state and times the spec out. It is a
  dev-server limit, not a product bug — the backend serves everything cleanly, and production has no
  Vite. If specs start flaking with "waiting for <testid>" 30s timeouts, check the worker count before
  hunting a race.
- **UI:** Playwright e2e for real user flows, plus a **responsive** spec asserting layout
  reflow (cards stack on mobile, row on desktop) and **no horizontal overflow** at 320px.
  Runs on desktop + mobile Chromium projects.

## Roadmap

Roadmaps are **split** (as of C3): one **platform/engine** roadmap plus one **per game**, living in that
game's folder. Read the relevant one before starting a phase.

- **[`ROADMAP.md`](./ROADMAP.md)** — the platform: the `GameModule`/`GameClient` seams (Track C), online
  multiplayer (Track B), the per-game **bot reorg**, deploy, and the games index.
- **[`engine/src/games/container/ROADMAP.md`](./engine/src/games/container/ROADMAP.md)** — Container's
  vertical slices + its AI (Track A).
- **[`engine/src/games/cantstop/ROADMAP.md`](./engine/src/games/cantstop/ROADMAP.md)** — Can't Stop: what
  C3 shipped + the plan to finish it (a bot).

We build each game as **vertical slices** (engine → API → UI → tests), not big-bang layers. Each slice
ends green and demoable, so it's a safe stopping point (and a clean place to check plan usage between
sessions). The Container summary below is retained for context; the per-game roadmaps are authoritative.

- **Phase 0 — Foundation ✅** monorepo, tooling, test gates.
- **Slice 0 — Produce ✅** architecture proof, wired end-to-end.
- **Slice 1 — Turn spine + Build ✅** 2 actions/turn with active-player enforcement, Build
  factory/warehouse, `legalActions`.
- **Slice 2 — Pricing & Reprice ✅** districts are priced lots (`StoredContainer[]`; factory $1–$6,
  harbor $2–$7); Produce places into lots; `reprice` action.
- **Slice 3 — Ships & sailing ✅** each player has a ship (`ShipLocation`, cargo ≤ `SHIP_CAPACITY`);
  `sail` moves one hop (ocean ↔ opponent harbor / island / bank, never own harbor).
- **Slice 4 — Trade chain ✅** `factoryPurchase` (opponent factory → your harbor, by truck) and
  `harborPurchase` (docked ship → load an opponent's harbor goods). Ships carry cargo.
- **Slice 5 — Delivery auctions ✅** container supply tracked + drawn down by Produce (end-game clock
  in the UI). Sailing a loaded ship to the island forces `deliver`: opponents bid, highest wins cargo
  into `scoringArea`, deliverer earns bid + matching subsidy, turn ends. **Buyout** and **runoff**
  ties are in ($0 bluff bids work by construction; buyout pays the supply until the Bank in Slice 6).
  *(This is what exists today.)*
- **Scoring cards ✅ (Slice 7 groundwork):** each player is dealt a secret `ScoringCard` at
  `createGame` (backend shuffles the deck); the UI reveals only the active player's card. Final
  *scoring* by the card lands in Slice 7.
- **Slice 6 — Off-Shore Bank & loans ✅** loans (`requestLoan`/`repayLoan`, interest, default). Bank
  board (`bank`: cash lots, container lots, tokens, auctions) + `holdingArea`. Interest, default
  seizures, and delivery buyouts flow into the Bank. `callBank` on **container lots** (bid cash) and
  **cash lots** (bid containers), one auction per type; win at turn start (`resolveBankWins`) →
  holding/cash; `loadHolding` picks up won containers. *(This is what exists today.)*
- **Slice 7 — Game end & final scoring ✅** ends when the supply runs out of 2 colors (checked at
  turn-advance); open Bank auctions awarded, then `finalScoring` (discard most-common w/ two-value
  rule, island score by card, leftover $3/$2/$0, −$11/loan) and winner (total → factory tiebreak →
  shared). `status: 'active' | 'ended'` + `results` + `winnerIds`; UI shows a results screen.
- 🎉 **Core game complete — fully playable hotseat.** Optional remaining work: Track A (AI),
  Track B (online multiplayer). Keep the 100% engine coverage gate for any new mechanics.
- **Track B / B1 ✅ (server-authoritative views).** Hidden info is now enforced server-side: the engine
  exposes a pure `viewFor(state, viewerId): GameView` (`engine/src/view.ts`) that redacts every
  non-viewer player's secret `scoringCard` to `null` (all revealed once `status === 'ended'`; a `null`
  viewer is a spectator). The DB keeps the full authoritative `GameState`; the backend applies `viewFor`
  at every response boundary, defaulting the viewer to the active player (hotseat) and honoring
  `GET /games/:id?viewer=<id>`. The UI consumes `GameView` (nullable `scoringCard`). **Never send a full
  unredacted `GameState` to a client** — always project through `viewFor` (the UI's `legalActions` cast
  is safe only because move enumeration never reads scoring cards).
- **Track B / B2 ✅ (real-time transport).** `GameHub` (`backend/src/hub.ts`) is an in-process pub/sub:
  `subscribe(gameId, socket, viewerId)` / `broadcast(gameId, state)`, each socket projected through
  `viewFor` (a `null` viewerId follows the active player). `@fastify/websocket` serves
  `GET /games/:id/stream`; `POST .../actions` calls `hub.broadcast` after `repo.update`. **REST stays
  authoritative — the socket is push-only; clients never send moves over it.** The UI subscribes via
  `api.subscribeGame` (version-guarded so a late push can't overwrite newer POST state; auto-reconnects)
  and offers join-by-code; Vite's `/api` proxy has `ws: true`. Tests: backend `app.injectWS` (initial
  snapshot + per-action push + fixed-seat viewer + unknown-game close) and `e2e/live-sync.spec.ts`
  (two browser contexts). The socket is push-only; any connected client can drive the active seat.
- **Track B / lobby ✅ (create → join & name → start).** Pre-game **lobbies** are coordination state
  *outside* the engine (`backend/src/lobbies.ts`: `lobbies` table + `LobbyRepository`; a `Lobby` is
  `{ id, seats, members: (name|null)[], status, gameId }`). Endpoints: `POST /lobbies {seats}` (3–5 empty
  seats), `GET /lobbies/:id`, `POST /lobbies/:id/join {name}` (claims the next empty seat),
  `POST /lobbies/:id/start` (all seats filled → `newGameFromNames` → `createGame`, links `gameId`). UI:
  the landing screen has **Create a shared game** (seat-count picker) beside the hotseat quick-start;
  **join-by-code** resolves a lobby *or* a started game; the waiting room **polls** `GET /lobbies/:id`
  (the game itself uses the WebSocket), shows seats filling live, lets a client claim ≥1 seat by name, and
  **Start** moves everyone into the game. Keep the hotseat quick-start + its testids intact — `createGame`
  still needs all players up front.
- **Track B / seat identity + turn-locking ✅.** Entering a game from the lobby binds the window to the
  seats you claimed via `controlledIds` (lobby seat _i_ → player `p{i+1}`; `null` = drive every seat, for
  hotseat / bare join). A bound client views the game **as its own seats** and shows an **identity banner**
  ("You are …" + "Your turn" / "Waiting for …"), and gates every action affordance on `canDrive`
  (`controlledIds` includes the active player) so off-turn clients can't act. **When adding new action
  controls, gate them on `canDrive` too.**
- **Hidden info: `viewFor` takes a `Viewer` = one seat, a seat _list_, or `null`/`[]`.** A seat-bound
  client sends `?viewer=p1,p3` (its own seats, comma-separated) on **all three** response paths — `GET`,
  the **`POST /actions` reply**, and the **WS stream** — so it sees exactly its own cards and nothing else,
  regardless of whose turn it is. Never "follow the active player" for a bound client (that once leaked the
  active seat's card, e.g. a host holding two seats seeing a third player's card). `null` viewer = follow
  active (hotseat, single device); empty list = spectator (no cards). **Any new endpoint that returns game
  state must project through `viewFor` with the caller's viewer.** Caveat that remains: turn-locking is
  client-side (the API isn't seat-authenticated). *(The delivery auction's secret bids were the other
  standing caveat here — fixed by A1a, which moved bid collection server-side.)*
- **Track B / open-games browser ✅ (no accounts).** `GET /lobbies` (`LobbyRepository.listOpen`) returns
  open lobbies with a free seat, newest first; the home screen polls it (every 3s while on the landing
  screen) and renders a **"Games waiting for players"** card. You enter a **display name** and Join to
  claim a seat and enter the waiting room — no code required. Intended for a home-server deploy where
  people just visit and play without accounts. Note: the Playwright backend shares one `:memory:` DB
  across the run, so `GET /lobbies` can surface lobbies from other specs — the browse spec targets its own
  lobby by code, and the browse card is landing-only (board/responsive specs start a game first).
- **Track B / resume in-progress games ✅ (no login).** `GET /games` (`GameRepository.listActive`, newest
  first, capped) returns **secret-free** summaries — `{ id, turn, status, activePlayerId, players:[{id,name}] }`,
  **never** scoring cards. The home screen polls it and shows a **"Games in progress"** card; `Resume as
  <name>` calls `resumeAs(gameId, playerId)` → `controlledIds=[id]`, fetches `getGame(id, viewer=id)`, and
  enters bound to that seat (own card only, turn-locked). Seats are **not** authenticated — anyone can
  resume any seat (intentional for home/LAN use). The same shared-`:memory:`-DB caveat applies to `GET
  /games` in e2e (resume spec targets its own game by id; the resume card is landing-only).
- **Slice 8 ✅ (UI/UX polish & board).** Original SVG art (`ui/src/components/art/{Container,Ship}.tsx`)
  replaces all colored-square chips via the `ContainerChip` wrapper (kept as `span[title]` for e2e
  counts). A `BoardMap` (`ui/src/components/BoardMap.tsx`) draws every ship on an
  ocean/island/bank/harbor board with click-to-sail. Motion (ship glide, active pulse, `.reveal-in`
  panels) is `motion-safe`/`prefers-reduced-motion`-gated; board nodes are focusable buttons with
  aria-labels. Visual-regression baselines: `ui/e2e/visual.spec.ts` (board only — deterministic at
  start; snapshots are per-OS `-darwin`, regenerate with `--update-snapshots` on other OS/CI). Art is
  **original** — do not reproduce any published game's specific artwork.
- **Track A / A0 ✅ (bot harness + greedy bot + self-play).** New `@game-hub/bot` package (see "The bot
  package" above). `decide(view, playerId, { collectBids })` returns a fully parameterized, legal
  `Action`; `bidFor(view, bidderId)` is a seat's sealed delivery bid; `playSelfPlay(state)` runs a whole
  game with every seat botted, each deciding from its own `viewFor` projection. Pure and deterministic —
  no I/O, no randomness — so a failing game always reproduces. **Not yet wired to the backend or UI:**
  A1 (pending delivery auction) then A2 (`BotRunner` + bot seats) do that.
- **Track A / A1a ✅ (delivery auction as coordination state).** `DELIVER` is a *single atomic action
  carrying every opponent's bid*, and the engine still has no pending-auction state — **keep it that
  way.** The half-finished auction lives in `backend/src/games/container/auctions.ts` (`delivery_auctions` table),
  the same "coordination state outside the engine" pattern as `lobbies.ts`.
  - **Bids are secret server-side.** `auctionViewFor(auction, state, viewer)` reveals *that* a seat has
    bid but never *what*, until every opponent has committed (`phase: 'bidding' → 'decision'`). **Any
    new response or push carrying an auction must go through `auctionViewFor`** — the raw
    `DeliveryAuction.bids` must never reach a client. This is the same rule as `viewFor` for cards.
  - **Flow:** `GET /games/:id/auction?viewer=<seat>` (one seat, not a list — bids are per-player) →
    `POST .../auction/bids` per opponent → on the last bid it flips to `decision` and reveals →
    `POST .../auction/resolve {playerId, buyout}` applies the one `DELIVER`. Posting `DELIVER` to
    `/actions` while an auction is due is rejected (409 `AUCTION_PENDING`).
  - **The auction is derived from game state** (`syncAuction` on read *and* write), never trusted to a
    stored row — that's what keeps a game that reached the island from wedging.
  - **Off-turn loans (pg. 16):** `REQUEST_LOAN` escapes the turn check *and* `MUST_DELIVER` in
    `applyAction`, so a broke opponent can borrow in order to bid. `legalActions(state, playerId)`
    takes an optional seat and answers for off-turn players. Repay/Bank-load stay on-turn.
  - **Hotseat** uses the same endpoints, prompting seats one at a time behind a pass-the-device gate.
- **Track A / A1b ✅ (runoff + the deliverer's tie choice).** Phases are `bidding → runoff → decision`;
  the same `POST .../auction/bids` endpoint serves both rounds (the phase decides where the bid lands).
  A runoff bid is *added* to the opening bid, so it's validated against the **total**. Opening bids stay
  visible through the runoff (pg. 16 — you add cash knowing what you're level on); runoff bids are
  secret until that round closes.
  - **`deliver` takes a `DeliveryResolution`** (`{ bids, runoffBids?, buyout?, chosenWinnerId? }`),
    mirroring the `DELIVER` action. A still-level runoff throws **`CHOICE_REQUIRED`** rather than
    guess a winner; offering `chosenWinnerId` when nothing is tied is rejected. A buyout needs no
    choice (nobody wins the cargo).
  - **⚠️ `deliveryOutcome(state, delivererId, bids, runoffBids)` is the ONE copy of the tie rule.**
    The backend projects the auction from it and the bot predicts the price with it. **Never
    re-derive who wins an auction** — that rule was about to exist in three places.
  - **Bot:** `runoffBidFor` (reaches nearer true value than the opening bid) + `chooseTiedWinner`
    (gives the cargo to whichever tied opponent it helps least, in expectation over their possible
    cards). `decide` takes `collectBids` **and** `collectRunoffBids` — A2's `BotRunner` wires both to
    the pending auction.
- **Track A / A2 ✅ (bot seats end-to-end).** `BotRunner` (`backend/src/games/container/botRunner.ts`) plays AI seats
  forward after any change, stopping when a human is on the clock. **Bots run server-side**, so hotseat
  and remote use one implementation and a game moves with no browser open.
  - **Which seats are bots is coordination state** (`game_bots` table, `bots.ts`) and rides *beside*
    the game — `{ game, bots }` on REST, `bots` on the WS state message. **Never put it in
    `GameState`**; the engine must not learn what a bot is.
  - **The runner has no special powers:** same `@game-hub/bot` policies as self-play, same
    `applyAction`, same `applyBid` as the REST route, and it decides from `viewFor(state, botId)`.
    When adding bot behaviour, keep it that way — a bot must not do what a player couldn't.
  - **⚠️ `tick` runs on read too** (`GET /games/:id`, `GET .../auction`, WS subscribe), not just on
    mutations. Nothing mutates while it's *already* a bot's turn, so after a restart the game would
    wedge with no human able to unstick it. Keep the read-path ticks.
  - **Synchronous throughout** (engine + SQLite are), so routes tick then re-read the game to reply.
  - **UI:** gate every new action affordance on `canDrive`, which now also excludes AI seats; and keep
    bot seats out of `mySeatIds` (bid prompts) and the resume list.

- **UX — activity feed + home link ✅.** `ui/src/components/GameLog.tsx` renders `GameState.log` as a
  running feed at the bottom of the board (newest first, 🤖 for bot seats, End-turn filtered out).
  **Everything the engine logs is public by construction** — `viewFor` passes `log` through untouched,
  so it is already on the wire — and the one real secret, a *losing* delivery bid, is deliberately
  never recorded (guarded by exact-payload tests in `deliver.test.ts`). **If a new mechanic ever logs
  something hidden, redact it in `record()`/`viewFor`, never in the UI** — the client gets the log
  either way, so hiding it there would hide nothing. The header title is a link home while in a
  game/lobby (`home-link`); leaving is safe and needs no confirm, since the game persists server-side
  (bots keep playing) and is rejoinable from "Games in progress".

- **Abandon a game ✅ (soft delete).** `POST /games/:id/abandon` closes out a game nobody means to
  finish; the home screen's in-progress card has an **Abandon game** button behind a two-step inline
  confirm (`abandon-<id>` → `abandon-yes-<id>` / `abandon-no-<id>`; the row drops optimistically since
  the list only polls every 3s).
  - **Soft, not hard:** an `abandoned_at` timestamp on `games`. The row and its move log survive, and
    the game stays **readable** (`GET` returns it with `abandoned: true`) — it just can't be played.
    `GET /games` filters it out **in SQL**, so abandoned games can't eat the `LIMIT 50` page.
  - **Not scored, deliberately.** `status: 'ended'` means the game reached its real end and
    `finalScoring` ran. An abandoned game has no legitimate winner, and inventing one would make
    `results`/`winnerIds` lie about a game nobody finished.
  - **409 `GAME_ABANDONED`, never 404** — the game exists and you may still look at it.
  - **⚠️ The gate is a `preHandler` hook in `app.ts`, above every route.** It must be, for two reasons:
    Fastify binds hooks to routes *at registration time* (move it down and it silently stops covering
    the routes it skipped), and **modules register their own mutating endpoints** (Container's
    `/auction/bids`, `/auction/resolve`) which would otherwise sail past a check that only `/actions`
    did. `tick()` is gated too — bots run server-side and are ticked **on reads**, so an ungated
    abandoned game would keep playing itself forever.
  - **Game-agnostic on purpose:** abandoning needs to know nothing about containers or bids, so it
    lives entirely in the core and every future game gets it free. No `GameModule` hook. If a change
    here ever needs `@game-hub/engine`, it's on the wrong side of the C0 seam.
  - **⚠️ Adding a column needs a real migration.** `CREATE TABLE IF NOT EXISTS` does **not** alter an
    existing table — every earlier schema change was a whole new table, which is why this never came
    up. `db.ts`'s `ADDED_COLUMNS` + `addMissingColumns()` runs `ALTER TABLE` on open, guarded by
    `PRAGMA table_info`. **Put new columns there, not just in the schema string**, or an already-
    deployed database (the point of the `/data` volume) never gets them.
- **Track C / C0 ✅ (`GameModule` interface + registry).** The site is now a games *room* with Container
  registered into it — see "The `GameModule` seam" above for the working rules. Pure refactor: the 90
  existing backend tests, 204 engine tests and 70 e2e specs all pass untouched. What moved:
  `newGameFromNames` → `container/createGame.ts` (rng injected), `parseAction` + the route's 13-value
  action enum → `container/parseAction.ts`, the `GameError`→HTTP map → `container/errors.ts`, the
  `/auction/*` routes → `container/routes.ts` (via `module.routes`), `auctions.ts`/`botRunner.ts` →
  `games/container/`. `GameRepository` gained `versionOf`/`movesOf` so it reads no game field.
- **Track C / C1 ✅ (`game_type` routing — the site can host two games).** `games.game_type`
  (`NOT NULL DEFAULT 'container'`, so existing rows backfill as SQLite adds the column); `moduleOf`
  reads it per request; module routes are namespaced under `/games/:id/<gameType>/` with a wrong-type
  guard; `GameHub` no longer imports the engine; lobbies carry a `gameType` (a JSON blob, so no
  migration — `readLobby` defaults old rows to `'container'`). `POST /games`/`POST /lobbies` take an
  optional `gameType`, defaulting to `AppOptions.defaultGameType` so the hotseat quick-start still works.
  **The core no longer imports `@game-hub/engine` at all.**
- **Track C / C2 ✅ (UI shell — the site is a games room).** `App.tsx` went from **1895 lines to 364**
  and no longer knows what Container is; no file in `ui/src` is over ~380. See "The `GameClient` seam"
  above for the working rules. The board is a lazy plugin (its own 41 kB chunk), the landing screen
  reads seat bounds from `GET /games/catalog`, and the picker appears only once two games are
  registered. Pure refactor — all 76 e2e specs passed **unchanged**, testids intact.
- **Track C / C3 ✅ (a second game — Can't Stop — proves the platform).** The honest test of the
  C0/C1/C2 seams: a real second game running beside Container on one server. Can't Stop
  (`reference_materials/CantStopRules.pdf`) is a push-your-luck dice game — roll 4 dice, split into two
  sums, advance ≤3 temporary "runners", bank by stopping or lose them by busting; first to claim **3
  columns** wins. Deliberately unlike Container: **no hidden information** (so `viewFor` is a no-op) but
  **per-turn randomness** (the dice), which is what stretched the seam.
  - **The engine became a per-game platform.** `engine/src/` now has `kernel/` (GameError, MoveRecord,
    Viewer) + `games/{container,cantstop}/`, exported by **subpath** (`@game-hub/engine/<game>`, no
    `.` default). Pure refactor of Container — its 204 tests moved untouched; the package is now 250
    tests at **100% coverage across both games**. See "How the shared engine is consumed" + "Building a
    new game".
  - **Per-turn randomness is injected via `ModuleContext.rng`** (the one seam change C3 needed). The
    engine stays pure: `ROLL` is a server-only action carrying already-rolled dice, built by the
    module's `/games/:id/cantstop/roll` route from `ctx.rng` and refused by `parseAction`/`legalActions`
    — a client asks to roll but can't choose the dice. No bots, no pending step, no side-channel:
    Can't Stop omits `createBotDriver`/`pendingStep`/`onStateChanged`, proving those hooks are optional.
  - **UI**: a lazy Can't Stop board plugs into the same `GameClient` seam; the landing **picker**
    activates automatically now that two games are registered. All existing e2e stayed green
    (`e2e/cantstop.spec.ts` added); the two-games-side-by-side backend test is the real proof.
  - **Deferred (fine for "simple"):** no Can't Stop AI, and the board is functional-not-fancy (no
    original art like Slice 8). Both are additive later. **Next: C4** could be a Can't Stop bot, or a
    third game to test the "extract when a shape is common" rule.
- **Track B — online multiplayer:** independent track. The authoritative, serializable engine makes all
  of these additive (see `ROADMAP.md`).

## Decisions & assumptions log

- **v1 is local hotseat / pass-and-play** (one screen). Online multiplayer and AI are future
  roadmap items. Revisit before Phase 4 if priorities change.
- **Container colors:** `white, red, green, blue, yellow` (from rulebook scoring cards).
- **"Player on your right"** (Produce union wage) is modeled as the **next seat index**
  `(seat + 1) % n`. Confirm against physical table convention if it ever matters for scoring.
- **Produce is "as many as you are able to"** (rulebook pg. 9), which shrinks the run rather than
  blocking it. A factory whose color the supply has run out of simply **idles**, and the other
  factories still produce; `capacity = min(producible colors, storage room)`. You may not
  under-produce below that. Only when *every* factory color is exhausted does Produce throw
  `OUT_OF_SUPPLY`, and `legalActions` omits it there. (Previously the engine demanded exactly one per
  factory, which made Produce *impossible* — not smaller — the moment any single color ran out, while
  `legalActions` still offered it. Since exhausting the supply is the end-game trigger, that hit every
  late game and every player, not just bots.)
- **Factory storage limit = 2 × factories**; **harbor limit = 1 × warehouses** (rulebook pg. 5).
  Starting player: 1 factory (dealt color), 1 warehouse, 1 matching container, $20, 2 bluff cards.
- **Package manager is pnpm** (corepack couldn't symlink into `/usr/local/bin`; pnpm was
  installed via Homebrew). Native `better-sqlite3` and `esbuild` builds are allow-listed in
  `pnpm-workspace.yaml`.
- **Slice scope:** the engine currently models only the factory district (what Produce needs).
  `types.ts` calls out what's deferred to Phase 2.

## Working agreement for Claude

- When implementing a mechanic, **read the relevant rulebook page first**; cite it in a comment.
- Never let engine coverage drop below 100%. Add tests with the code, not after.
- Keep the engine pure. If you need I/O or randomness, it belongs in backend/ui or is injected.
- Prefer extending the vertical-slice patterns (typed errors, immutable state, testids) over
  inventing new ones.
- Update this file's **Roadmap** and **Decisions log** when direction changes.
