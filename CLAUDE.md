# CLAUDE.md — Container (digital board game)

Context and working agreement for this repo. Read this first.

## What we're building

A faithful digital version of the board game **Container (10th Anniversary Edition)**.
This is a learning project: the owner is an experienced software engineer who wants
**good engineering practices** throughout — clean separation of concerns, strong typing,
and high test coverage.

Non-negotiables set at kickoff:

- **100% unit-test coverage of the game engine** (mechanics). Enforced by a coverage gate.
- The UI has automated tests via **Playwright**, including **responsive regression** tests
  from desktop down to mobile widths.
- Monorepo with separate `ui/` and `backend/` (plus a shared `engine/`).

## The game (rules summary)

Authoritative source: `reference_material/Container_Rulebook_v8.pdf` (20 pages). Read it
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
├── engine/     @container/engine  — pure, deterministic rules core (NO I/O, NO randomness)
├── bot/        @container/bot     — AI players; pure policies over a redacted GameView
├── backend/    @container/backend — Fastify REST API; persists to SQLite; runs the AI (BotRunner)
│   └── src/games/                 — the GameModule seam: module.ts (contract), registry.ts,
│                                    container/ (Container as one registered game)
├── ui/         @container/ui      — React + Tailwind + shadcn; talks to the API
└── reference_material/            — the rulebook PDF
```

**Data flow:** UI → REST → backend → **engine** (authoritative) → SQLite snapshot + move log.
Moves always go over REST; the backend then **pushes** the new state to all connected clients over a
WebSocket (`GameHub`), each projected per-viewer via `viewFor`. The socket is push-only (never a move channel).

**Coordination state lives outside the engine.** Anything that is *not* a rule — pre-game lobbies
(`lobbies.ts`), pending delivery auctions (`games/container/auctions.ts`), and which seats are bots
(`bots.ts`) — is backend state with its own table and its own per-viewer projection. The engine stays a
pure `state + action → state` library that knows nothing about rooms, sealed bids, or bots. Reach for
this pattern before reaching into the engine.

### The `GameModule` seam (Track C / C0)

The backend hosts **games**, plural, through one contract: `backend/src/games/module.ts`. Container is
one registered module (`games/container/`), not the only thing the server can do.

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
- **Randomness is injected** (`createGame({ rng })`), never reached for inside a module. That's what
  keeps every engine pure, deterministic and replayable.
- **⚠️ Exactly one game may be registered until C1** adds `game_type`. Without that column a row is just
  JSON and "which module owns it?" is unanswerable, so `buildApp` throws rather than guess.
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

`@container/engine` exports **TypeScript source** (`exports: "./src/index.ts"`), not a build.
Both consumers transpile it directly:

- **backend** — `tsx` (dev/prod-start) and Vitest (`server.deps.inline: [/@container\/engine/]`)
  transform the TS source across the workspace boundary.
- **ui** — `vite.config.ts` aliases `@container/engine` → `../engine/src/index.ts` so Vite
  bundles it as project source. This also gives the **frontend shared types** (`GameState`,
  `Color`, …) for free.

`engine` also has a real `build` (`tsc -p tsconfig.build.json` → `dist/`) used for typecheck/
distribution; consumers may switch to `dist` later if we ever publish.

### The bot package (`@container/bot`, Track A)

**Engine = rules, bot = opinions.** The engine says what is *legal*; the bot only says what is *wise*.
No bot code goes in `engine/`, and the engine must never learn what a bot is. A bot is not
authoritative — it just produces an `Action` that the engine validates like any human's move.

- **Bots decide from a `GameView`, never a `GameState`:** `decide(viewFor(state, botId), botId)`. Taking
  the redacted view makes cheating *structurally impossible* rather than a matter of discipline;
  `selfOf()` enforces the other half (the bot's own card must be visible, or the caller passed the
  wrong view). **Never hand a bot a full `GameState`.**
- **Coverage gate is 90%, not 100%** (deliberate — see `bot/vitest.config.ts`). Heuristic weights get
  retuned constantly, and a 100% bar on judgement calls buys churn, not correctness. What must stay
  covered: every decision is legal, every policy reachable.
- **Layout** mirrors the engine's conventions: one policy per concern in `policies/`, barrels re-export
  only, tests in `src/tests/`. Adding a policy = a `rank*` function + a `rank.ts` case + a test.
- **`legalActions` markers are not playable.** Five of twelve actions come back as bare markers that
  `applyAction` throws on; completing them is `rank()`'s job and *is* the strategy.
- **Value containers with `gainFrom`, never `card.values[color]`** — the discard rule makes marginal
  value differ from face value, and it can be **negative**.
- **Self-play (`playSelfPlay`) is the package's real test** — it drives thousands of live engine actions,
  so any illegal action throws. Keep it passing for all of 3–5 players.
- **Greedy bots cannot see multi-action payoffs.** The delivery run is 4+ actions; score long chains
  against the *goal*, not the hop, or ships never leave port (this actually happened — see ROADMAP A0).

### Engine module layout

The engine is organized into small, single-responsibility modules (SRP) with barrel files; the
public API is defined solely by `engine/src/index.ts`. Consumers import only from `@container/engine`,
never deep paths.

```
engine/src/
  index.ts            # THE public API (the only thing consumers import)
  createGame.ts       # game setup
  core/               # foundational data/types, no game logic
    colors.ts  constants.ts  errors.ts  types.ts  index.ts
  internal/           # shared helpers (DRY), not part of the public API
    players.ts        # seatOf, getPlayer, withPlayer
    containers.ts     # colorsOf, isSubMultiset, assertValidLots
    record.ts         # record() — the one place that bumps version + appends to the log
    index.ts
  actions/            # ONE file per action/mechanic + the dispatcher
    action.ts         # the Action union
    produce.ts  build.ts  reprice.ts  endTurn.ts
    applyAction.ts    # turn-aware dispatcher (the single entry point for a move)
    legalActions.ts   # enumerates legal moves
    index.ts
  tests/              # ONE test file per piece + shared helpers
    helpers.ts        # makeGame/makePlayer/sc/expectError/newGame (DRY test fixtures)
    <piece>.test.ts
```

**Conventions (follow these when adding mechanics):**
- **One mechanic = one file** in `actions/` + **one matching test file** in `tests/`. Reuse
  `internal/` helpers rather than re-implementing (DRY). Never bump `version`/`log` outside `record()`.
- **Barrels** (`index.ts`) only re-export; they contain no logic and are excluded from coverage
  (along with type-only files `core/types.ts`, `actions/action.ts`).
- **Keep files small and single-responsibility** — well under any 1000-line linter threshold. If a
  file is growing past a few hundred lines, split it.
- Within a folder, import siblings by **direct path** (e.g. `applyAction.ts` imports `./produce`),
  not via the folder barrel, to avoid cycles. Import across folders via the barrel (`../core`, `../internal`).
- Adding a new action = new `Action` variant in `action.ts` + a mechanic file + an `applyAction`
  case + a `legalActions` branch + a public export in `src/index.ts` + a test file.

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
- **Test layout:** engine/backend **unit tests live in `src/tests/`** (e.g. `engine/src/tests/`,
  `backend/src/tests/`), not colocated beside source. UI **Playwright specs stay in `ui/e2e/`**.
  Vitest's `include: ['src/**/*.test.ts']` and the coverage excludes already match the nested path,
  so no config change is needed when adding tests.

## Commands

```bash
pnpm install                # bootstrap the workspace

# Tests
pnpm test                   # every workspace's tests
pnpm test:engine            # engine unit tests + 100% coverage gate
pnpm test:bot               # bot unit tests + self-play games + 90% coverage gate
pnpm test:backend           # backend integration tests (Fastify inject + :memory: sqlite)
pnpm test:e2e               # Playwright (auto-starts API + UI); needs: pnpm --filter @container/ui exec playwright install chromium
pnpm typecheck              # strict typecheck across all packages

# Dev (run both in separate terminals)
pnpm dev:backend            # API on :3001
pnpm dev:ui                 # UI on :5173 (proxies /api → :3001)

# Production container (single image serves UI + API on one port; SQLite on a volume)
docker build -t container-game:latest .
docker run -d -p 8080:3001 -v container-game-data:/data container-game:latest  # → http://host:8080
```

## Deployment (home server / Portainer)

A single Docker image serves the built UI **and** the API on one port (`Dockerfile`, multi-stage:
build UI + native SQLite, then a slim Node runtime). The backend serves `ui/dist` as static files when
`UI_DIST` is set and falls back to `index.html` for non-API GETs (SPA); in a production build the UI's
API base is same-origin (`import.meta.env.PROD ? '' : '/api'`), so there's no CORS/proxy. Games persist
to `DATABASE_PATH` (default `/data/container.sqlite`) — mount `/data` to a volume so they survive
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

The full, sliced plan lives in **[`ROADMAP.md`](./ROADMAP.md)** — read it before starting a phase.

We build the rest of the game as **vertical slices** (engine → API → UI → tests), not big-bang
layers. Each slice ends green and demoable, so it's a safe stopping point (and a clean place to
check plan usage between sessions). Summary:

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
- **Track A / A0 ✅ (bot harness + greedy bot + self-play).** New `@container/bot` package (see "The bot
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
  - **The runner has no special powers:** same `@container/bot` policies as self-play, same
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
    here ever needs `@container/engine`, it's on the wrong side of the C0 seam.
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
  **Next: C1** — `game_type` column + backfill, `moduleFor` reads it, namespace module routes, and make
  `GameHub` project through the module (it's the last engine import left in the core).
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
