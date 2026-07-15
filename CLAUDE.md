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
├── backend/    @container/backend — Fastify REST API; persists state to SQLite
├── ui/         @container/ui      — React + Tailwind + shadcn; talks to the API
└── reference_material/            — the rulebook PDF
```

**Data flow:** UI → REST → backend → **engine** (authoritative) → SQLite snapshot + move log.

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
pnpm test:backend           # backend integration tests (Fastify inject + :memory: sqlite)
pnpm test:e2e               # Playwright (auto-starts API + UI); needs: pnpm --filter @container/ui exec playwright install chromium
pnpm typecheck              # strict typecheck across all packages

# Dev (run both in separate terminals)
pnpm dev:backend            # API on :3001
pnpm dev:ui                 # UI on :5173 (proxies /api → :3001)
```

## Testing strategy

- **Engine:** exhaustive unit tests; **100% statements/branches/functions/lines** enforced in
  `engine/vitest.config.ts`. Every rule and every rejection path gets a test. This is the
  primary correctness guarantee.
- **Backend:** integration tests via `app.inject` against an in-memory SQLite DB — covers HTTP
  contract, validation, persistence, and error mapping.
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
- **Slice 8 ✅ (UI/UX polish & board).** Original SVG art (`ui/src/components/art/{Container,Ship}.tsx`)
  replaces all colored-square chips via the `ContainerChip` wrapper (kept as `span[title]` for e2e
  counts). A `BoardMap` (`ui/src/components/BoardMap.tsx`) draws every ship on an
  ocean/island/bank/harbor board with click-to-sail. Motion (ship glide, active pulse, `.reveal-in`
  panels) is `motion-safe`/`prefers-reduced-motion`-gated; board nodes are focusable buttons with
  aria-labels. Visual-regression baselines: `ui/e2e/visual.spec.ts` (board only — deterministic at
  start; snapshots are per-OS `-darwin`, regenerate with `--update-snapshots` on other OS/CI). Art is
  **original** — do not reproduce any published game's specific artwork.
- **Track A — AI play** and **Track B — online multiplayer:** independent tracks after the core
  game is playable. The authoritative, serializable engine makes both additive (see `ROADMAP.md`).

## Decisions & assumptions log

- **v1 is local hotseat / pass-and-play** (one screen). Online multiplayer and AI are future
  roadmap items. Revisit before Phase 4 if priorities change.
- **Container colors:** `white, red, green, blue, yellow` (from rulebook scoring cards).
- **"Player on your right"** (Produce union wage) is modeled as the **next seat index**
  `(seat + 1) % n`. Confirm against physical table convention if it ever matters for scoring.
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
