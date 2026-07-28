# Design patterns — how Game Hub works, and why

This is the reference for anyone (including a future Claude session) working on **platform** or **game**
code. It explains the seams, the invariants, and the hard-won rules — organized by principle, not by the
history that produced them. For the step-by-step "add a game" recipe, see
[`game-creation.md`](./game-creation.md). For the history and rationale of externalizing games into
packages, see [`track-d-externalize-games.md`](./track-d-externalize-games.md) (design) and
[`track-d-legacy-migration.md`](./track-d-legacy-migration.md) (the migration that made all five games
package-shaped).

Naming split, once: the **platform** is "Game Hub" (npm scope `@game-hub/*`). **Container** is one game
*on* it (id `container`), not the platform. Don't conflate them.

The ⚠️ notes below are not decoration — each marks something that actually broke once.

---

## The shape at a glance

```
packages/
  kernel/          @game-hub/kernel — the tiny neutral dependency every game and both hosts build on:
                     primitives + the GameModule / GameClient contracts (host bindings are generics)
  games/<id>/      @game-hub/game-<id> — one package per game, four TS-source subpath exports:
                     ./engine  (pure rules)  ./module  (backend seam)  ./client  (UI seam)  ./bot (AI)
  bench/           @game-hub/bench — dev-only bot-strength harness (root `pnpm bench`)
backend/           @game-hub/backend — game-agnostic Fastify core + SQLite + the generated registry
ui/                @game-hub/ui — game-agnostic React shell + the generated registry
games.config.ts    the ordered list of hosted games → `pnpm generate` → the two registries
```

**Data flow:** UI → REST → backend → **module → engine** (authoritative) → SQLite snapshot + move log.
Moves always go over REST; the backend then **pushes** new state to every connected client over a
WebSocket, each projected per-viewer via the module's `viewFor`. The socket is push-only — never a move
channel.

The whole design is three seams stacked the same way at every layer — **engine**, **module** (backend),
**client** (UI) — each with an "only the game knows this" rule and a game-agnostic host on the other side.
The kernel is the neutral contract all three build against.

---

## 1. The three-layer seam story

### The engine is a pure function library

The engine is the **single source of truth** for rules: `state + action → new state`, or it throws a
typed `GameError`. It has no dates, no randomness, no network, no DB, and it never mutates its input
(there is a test asserting immutability). This is what makes the 100% coverage gate reachable and keeps
the door open for online multiplayer and AI — both just drive the same engine.

- **Randomness is injected, never reached for.** At setup it comes in as `createGame({ rng })`; per action
  it rides *in the action itself* — a dice roll is an action carrying the already-rolled values, built
  server-side from `ModuleContext.rng`. ⚠️ A module (or engine) reaching for `Math.random` is the bug this
  prevents: it kills replay and deterministic tests at once.
- **Every move flows through `applyAction(state, playerId, action)`** — the turn-aware entry point that
  enforces turn order and the game's own turn structure, then dispatches to pure mechanic functions.
  Container's is a 2-action budget; Can't Stop and Stone Age are phase machines (roll/select/stop;
  placement/actions/feeding). The entry point is common; the turn shape is per-game.
- **`legalActions(state, playerId?)`** enumerates what a seat may do — it drives UI enable/disable *and*
  the bots, computed the same way on both. The optional seat lets it answer for off-turn players
  (Container admits off-turn `REQUEST_LOAN` so a broke opponent can borrow to bid).
- **All rejections throw `GameError`** with a stable code. The module maps codes → HTTP; new codes are
  added in the engine, never as ad-hoc strings.
- **`version` increments once per applied action**, mirrored onto the row for optimistic concurrency
  (see Persistence).

Engine layout is one folder per game under `src/engine/`, over the kernel: `core/` (types, constants,
errors), `internal/` (shared helpers incl. `record()`), `actions/` (one file per mechanic + the
dispatcher + `legalActions`), `tests/`. **One mechanic = one file + one matching test file.** Barrels
only re-export (excluded from coverage, along with type-only files). ⚠️ Never bump `version`/append to the
log outside `record()` — it is the one place that does both.

### The module is the backend seam (`GameModule`)

The backend hosts **games, plural**, through one contract: `GameModule<S, A>` (defined in
`@game-hub/kernel`, bound to the host's concrete types in each package's `src/module/context.ts`). A
module binds the engine's rules to the host: `createGame`, `applyAction`, `legalActions`, `viewFor`,
`parseAction`, `summarize`, `versionOf`, `movesOf`, `mapError`, plus a `colors` palette — and optional
hooks `pendingStep` / `routes` / `onStateChanged` / `createBotDriver` / `schemaVersion`+`migrate`.

- **`games.game_type` says whose rules a row plays by.** A game's state is an opaque blob, so this column
  is the only thing tying it to an engine. **Every route resolves its module from the row**
  (`moduleOf(gameId)`), never from a default — that keeps state and rules together. Adding a game is
  registering it; there is no other switch.
- **A game's own endpoints live under `/games/:id/<gameType>/…`** (Container's auction is
  `/games/:id/container/auction`). A module declares paths *relative* to that. This is correctness, not
  tidiness: unprefixed, two games both wanting `/auction` is a boot crash, and whichever registered first
  would be handed *every* game's requests. A scope guard also refuses a row that isn't that module's type
  (`WRONG_GAME_TYPE`) — a prefix is just a URL anyone can type.
- **Seat ranges, action types, errors, bots and the colour palette are all the module's.**
  `POST /lobbies {gameType}` validates seats against *that game's* min/max; a colour pick against *that
  game's* palette (both exposed on `GET /games/catalog`).
- **`POST /games/:id/actions` takes opaque JSON.** Fastify validates only `{ playerId, action: object }`;
  **all** action validation is `module.parseAction`. ⚠️ Don't re-add a `type` enum to the route — that's
  the thing that couldn't survive a second game. `parseAction` accepts only the actions a *client* may
  send; server-only actions (a dice roll) are refused there and built by a route.
- **The core is game-agnostic and reads no field off a game state** — id, version, move log, summary and
  projection all come from the module (`app.ts` / `repository.ts` contain no game-specific code). **When
  adding backend behaviour, ask which side it belongs on.** If it needs to know what a container or a bid
  is, it goes in the game package.
- **A game's own weirdness goes behind the optional hooks, not into the core.** Container's delivery
  auction is the whole reason `routes`/`pendingStep`/`onStateChanged`/`createBotDriver` exist. We
  deliberately did **not** build a generic sealed-bid framework off one example (see the restraint rule).
  A routeless game (Saint Petersburg) omits `routes` entirely; Can't Stop omits `pendingStep`,
  `onStateChanged` and `createBotDriver` too.
- **An unregistered `game_type`** (a module pulled while its rows remain) is `409 GAME_TYPE_UNAVAILABLE`;
  such rows are skipped by `GET /games` rather than taking the home screen down.

**`ModuleContext` is what a module is handed to do its job** — all *coordination* infrastructure, none
game-specific: `db` (open your own table), `games` (persistence with your module pre-bound), `botSeats`,
`hub`, `rng`, `pushGame`, `bots`, `colorsFor`. Its host bindings (`Db`, `Hub`, `BotSeats`) are **generic
parameters**, so the contract imports no backend. See §7 for why the structural host types exist.

### The client is the UI seam (`GameClient`)

The UI mirrors the backend split. `App.tsx` is the **Game Hub shell**: landing, lobby, navigation, seat
binding, and the transport. A game plugs in a **board**; the shell renders it and never reads a game's
state.

- **⚠️ No shell file may import a game.** `e2e/architecture.spec.ts` fails the build if a file outside
  `ui/src/games/<game>/` imports `@game-hub/engine` (historical, now banned defensively) *or* a
  `@game-hub/game-*` package. This is the rule most likely to be undone by accident (someone needs
  `COLORS` in a shell file, adds one import, and the games room is quietly a Container app again). If shell
  code seems to need a rule, a colour, a piece or a seat count, the need belongs on the other side:
  **seat bounds come from `GET /games/catalog`**, not a `MIN_PLAYERS` constant. Only `games/registry.ts`
  may name a specific game.
- **`unknown` at the seam, never inside a board.** `lib/api.ts` is generic in `S` (`getGame<GameView>(…)`);
  a game's own `api.ts` pins the types back, so the board is fully typed. ⚠️ Don't widen a board's props to
  `unknown` to make a call type-check — pass the type parameter. There is **exactly one cast**, at
  registration in `registry.ts` (TypeScript can't type a heterogeneous list of `GameClient<S>` because
  React props are contravariant). It's sound because `gameType` picks the client, so a board only ever
  gets a state its own game produced.
- **The shell owns the socket; the board owns its side-channels.** `useGameTransport` handles
  `type: 'state'` and hands every other frame back as `lastMessage` for the board to interpret (Container
  reads `type: 'auction'`). Don't put a game's concept back into the transport.
- **The board is lazy** (`lazy(() => import('./Board'))`) and must stay that way — it carries the engine,
  the panels and the art, and the landing screen ships none of it. `Status` (the header status line —
  "2 actions left" is a Container rule) is a plugin slot: keep it cheap and non-lazy, it renders before
  the board chunk lands. `blurb` + `rules` feed the landing's game description.
- **Shared chrome lives in `ui/src/components/`** and is typed off the payload's plain seat shape, never
  off an engine: `seatIdentity` (the `canDrive` + `myNames` seat-binding rule — **gate every action
  affordance on `canDrive`**), `TurnBanner`, `ActivityFeed` (the 🤖-badged log; the per-game part is a
  `describe(entry) => string | null` closure), and `GameOver` (every game's end screen). A board keeps its
  own banner wording and `describe`; the frame is shared.
- **Every game payload carries `gameType`** (`{ game, gameType, bots, colors, players, activePlayerId }`,
  plus the WS state push) — how the shell picks a board for a state it just fetched. `players` +
  `activePlayerId` are the **secret-free seat identity** the shell uses to name seats and apply seat
  binding without duck-typing the opaque `game`. A new route returning game state must include all of them.

---

## 2. Coordination state lives outside the engine

Anything that is *not a rule* is backend coordination state with its own table and its own per-viewer
projection — the engine stays a pure `state + action → state` library that knows nothing about rooms,
sealed bids, bots, colours, or rematches. **Reach for this pattern before reaching into the engine.**

The worked examples:

- **Lobbies** (`lobbies.ts`) — pre-game rooms: create → join & name → start.
- **Delivery auctions** (Container's `src/module/auctions.ts`) — pending sealed bids (see §3).
- **Bots** (`bots.ts`) — which seats an AI holds, plus each seat's difficulty tier.
- **Colours** (`colors.ts`) — which palette id each seat picked.
- **Rematch** (`rematch.ts`) — play-again proposals.

**Game-agnostic ones (bots, colours, abandon, rematch) live in the core with no `GameModule` hook**, so
every game gets them free. That's the real payoff of the seam.

**Player colours are the fully-worked example.** Each module declares an ordered `colors` palette
(lowercase ids). The platform offers the pick (lobby join + a waiting-room/landing swatch picker;
`POST /lobbies/:id/color`; `POST /games` takes each seat's `color`), validates against the palette
(`400 INVALID_COLOR` / `409 COLOR_TAKEN`), assigns on create/start (picks honoured, the rest defaulted in
**palette order** — which reproduces each board's old per-seat tints, so visual baselines don't move), and
persists them in `game_colors`. Colours ride **every** state payload as `colors: Record<playerId,
colorId>`. **The engine never learns a colour** — it is presentation, same rule as bots. A board maps the
id to its own tint system, falling back to seat index when one is missing.

Difficulty tiers are coordination state too (see §6).

---

## 3. Redaction & hidden information

Hidden information is enforced **server-side**, never as UI discipline. The engine exposes a pure
`viewFor(state, viewer): GameView` and the backend applies it at **every** response boundary.

- **`viewFor` takes a `Viewer`** = one seat, a seat *list*, or `null`/`[]`. A seat-bound client sends
  `?viewer=p1,p3` (its own seats) on **all** state paths — `GET`, the `POST /actions` reply, and the WS
  stream — so it sees exactly its own secrets regardless of whose turn it is. `null` = follow the active
  seat (hotseat, single device); `[]` = spectator (no secrets). ⚠️ Never "follow the active player" for a
  bound client — that once leaked the active seat's card to a host holding two other seats. **Any new
  endpoint that returns game state must project through `viewFor` with the caller's viewer.**
- **Redaction is an explicit per-game decision.** Container redacts each non-viewer's secret scoring card
  to `null`; Saint Petersburg redacts each non-viewer's **hand and rubles**; Can't Stop and Stone Age
  hide (almost) nothing, so their `viewFor` is nearly a no-op. The kernel must **not** assume redaction —
  that a game with no secrets exists is what keeps the abstraction honest. All secrets are revealed once
  `status === 'ended'`.
- **⚠️ Everything the engine logs is public by construction.** `viewFor` passes the move `log` through
  untouched, so it is already on the wire. The one real secret — a *losing* delivery bid — is deliberately
  never recorded (guarded by exact-payload tests). **If a new mechanic ever logs something hidden, redact
  it in `record()`/`viewFor`, never in the UI** — the client gets the log either way, so hiding it there
  would hide nothing.
- **Auction bids are secret server-side too.** Container's `auctionViewFor(auction, state, viewer)`
  reveals *that* a seat has bid but never *what*, until every opponent has committed
  (`phase: 'bidding' → 'decision'`; a runoff round re-hides its added bids the same way). The raw
  `DeliveryAuction.bids` must never reach a client. ⚠️ The auction is **derived from game state** on read
  *and* write (`syncAuction`), never trusted to a stored row — that's what keeps a game that reached the
  island from wedging. And `deliveryOutcome(...)` is the **one** copy of the tie rule (the backend
  projects the auction from it and the bot predicts the price with it) — never re-derive who wins an
  auction.
- **⚠️ Never send an unredacted `GameState` to a client.** The DB keeps the full authoritative state; the
  wire only ever carries a `viewFor` projection.

---

## 4. Transport

- **REST is authoritative; the WebSocket is push-only.** Moves go over `POST /games/:id/actions`. After
  `repo.update`, the backend calls `hub.broadcast`, which fans the new state to every subscriber, each
  projected through `viewFor` for its own seat(s). Clients **never** send moves over the socket.
- **`GameHub` is game-agnostic** — it fans out per-viewer messages and projects nothing itself, so
  redaction stays an explicit decision made by code that knows the game. The client subscribes via
  `subscribeGame` (version-guarded so a late push can't overwrite newer POST state; auto-reconnecting).
- **⚠️ The WS is exempt from CORS, so `/games/:id/stream` enforces its own origin check.** It refuses a
  cross-origin upgrade (`1008`) unless same-origin, no-Origin (non-browser), or in
  `AppOptions.allowedOrigins` / `ALLOWED_ORIGINS`. A reverse/Vite proxy fronting the socket under a
  different Host than the browser's Origin (the e2e setup) must list that origin. There is also a per-IP
  connection cap (`1013` over it) and `maxPayload: 1024` — the socket is push-only, so **don't add a
  client→server WS message; add a REST route instead.**
- **⚠️ When adding a top-level API route**, update the `setNotFoundHandler` SPA-fallback allowlist regex
  in `app.ts` (`/^\/(games|lobbies|health)\b/`) so it isn't swallowed by the SPA fallback.

---

## 5. Persistence

SQLite: a `games` table (JSON snapshot + metadata) and an append-only `moves` log. Engine state is
serializable, so the log enables replay/audit.

- **Optimistic concurrency.** `version` increments once per action, mirrored onto the row.
  `POST /games/:id/actions` takes an optional `expectedVersion`; a mismatch is `409 STALE_VERSION` (the UI
  refetches rather than erroring). `GameRepository.update` guards `WHERE version = ?` as the backstop.
  Module routes and the bot runner pass **no** `expectedVersion` — they re-read inside one synchronous span.
- **⚠️ Two different "schemas", two different migrations.**
  - A **DB column** is the table's schema. `CREATE TABLE IF NOT EXISTS` does **not** alter an existing
    table, so a new column needs a real `ALTER TABLE`: put it in `db.ts`'s `ADDED_COLUMNS` +
    `addMissingColumns()` (guarded by `PRAGMA table_info`), not just the schema string — or an
    already-deployed database (the point of the `/data` volume) never gets it.
  - The **state blob's** schema is the *module's* (architecture review §4.1). The state is one opaque `TEXT` column, so
    reshaping a shipped engine's serialized state is **not** a column migration: bump the module's
    `schemaVersion` and write `migrate(state, from)`. `GameRepository.get(module, id)` upgrades a stale row
    write-on-read (migrate → persist + re-stamp `schema_version`, **not** a move: no `version` bump, no
    log append), and refuses a row from a *newer* server with `409 GAME_SCHEMA_UNSUPPORTED`. A higher
    `schemaVersion` with no `migrate` throws loudly. All five games are shape-v1 (no `schemaVersion`).
- **Abandon is a soft delete** (`games.abandoned_at`). The row and log survive and stay *readable*
  (`GET` returns it with `abandoned: true`) — it just can't be played (`409 GAME_ABANDONED`, never 404).
  Not scored, deliberately: an unfinished game has no legitimate winner, and inventing one would make
  `results`/`winnerIds` lie. `GET /games` filters it out **in SQL** so it can't eat the `LIMIT 50` page.
  ⚠️ **The gate is a `preHandler` hook in `app.ts`, above every route** — Fastify binds hooks to routes at
  registration time (move it down and it silently stops covering the routes it skipped), and **modules
  register their own mutating endpoints** (Container's `/auction/*`) which would otherwise sail past a
  check that only `/actions` did. `tick()` is gated too — bots run on reads, so an ungated abandoned game
  would keep playing itself forever. Abandon needs nothing game-specific, so it lives entirely in the core
  with no `GameModule` hook and every game gets it free.

---

## 6. Bots

**Engine = rules, bot = opinions.** The engine says what is *legal*; the bot only says what is *wise*. A
bot is not authoritative — it produces an `Action` the engine validates like any human's move, and the
engine must never learn what a bot is.

- **A bot decides from a `GameView`, never a `GameState`:** `decide(viewFor(state, botId), botId)`. Taking
  the redacted view makes cheating *structurally impossible* rather than a matter of discipline. For a
  game with secrets, `selfOf()`-style helpers enforce the other half (the bot's own card must be visible).
  **Never hand a bot more than a player's view.**
- **⚠️ Randomness the bot can't invent is injected by the caller** — Container's `collectBids` (sealed
  opponent bids), Can't Stop's / Stone Age's `rollDice` (server-side dice). `decide` throws a `BotError` if
  the caller didn't supply it. Self-play seeds it; the backend runner fills it from `ctx.rng`.
- **`runBotLoop` (kernel) plays a game's AI seats forward** after any change, stopping when a human is on
  the clock. Each game's backend runner (`createBotDriver`) wires it. ⚠️ The runner has **no special
  powers**: same policies as self-play, same `applyAction`, same view redaction. A bot must not do what a
  player couldn't. ⚠️ `tick` runs on **reads** too (GET, auction GET, WS subscribe), not just mutations —
  nothing mutates while it's already a bot's turn, so after a restart the game would wedge with no human
  able to unstick it.
- **Difficulty tiers are probability-parameterized, not different algorithms** (Can't Stop, CS4): one
  `DifficultyParams` set per tier over the *same* EV model. `normal` is the frozen baseline (byte-identical
  — every no-tier call defaults to it, so self-play and bench baselines never shift). **Which tier a seat
  plays is coordination state** (`game_bots.difficulty`, defaulting `'normal'`), never engine state — the
  module *declares* its tiers via `GameModule.botDifficulties` (only Can't Stop does), validated at
  `POST /games` / lobby join (`INVALID_DIFFICULTY`) and read back by the runner. Other games declare no
  tiers and their drivers ignore the column. The ordering is **harness-proven** (`bench`, the
  calibrate-then-commit convention).
- **⚠️ Greedy bots cannot see multi-action payoffs.** Container's delivery run is 4+ actions — score long
  chains against the *goal*, not the hop, or ships never leave port (this actually happened; Stone Age hit
  the same class of bug with a myopic food heuristic). Watch for it in any new bot.
- **Self-play (`playSelfPlay`) is each bot's real test** — it drives thousands of live engine actions, so
  any illegal action throws. Keep it passing.
- Coverage gate is **90%, not 100%** (deliberate): heuristic weights get retuned constantly, and a 100%
  bar on judgement calls buys churn, not correctness. What must stay covered: every decision is legal,
  every policy reachable.

The bot kernel (`@game-hub/kernel/bot`) is tiny: `BotError`, `assertBotTurn` (the byte-identical `decide`
preamble — ended-check + not-your-turn check), `makeProgressGuard` (the self-play runaway guard), and the
benchmark helpers (`runBenchmark`, `wilsonInterval`, `mulberry32`). A bot's actual opinions are
game-specific and live in the package's `src/bot/`.

---

## 7. The kernel contract & versioning

`@game-hub/kernel` is the small, neutral dependency every game and both hosts build against — extracted so
a game can one day live in its own package without the engine, the backend contract, and the UI contract
reaching into each other. It is consumed as **TS source by subpath**, and — unlike a game package — it
**may** have a `.` entry (it's the kernel, not a per-game platform, so there's no default-game ambiguity):

- `@game-hub/kernel` (`.`) — the framework-free surface: the engine primitives (`GameError`,
  `MoveRecord`, `Viewer`, `record`, `makeSeating`, `GameEndState`/`WinnersEndState`), the game-agnostic
  bot drive-loop `runBotLoop`, **and** the `GameModule`/`ModuleContext`/`BotDriver`/… contract. Its host
  bindings (`Db`, `Hub`, `BotSeats`, `App`) are **generic parameters**, so the contract imports no backend.
- `@game-hub/kernel/client` — the React `GameClient`/`BoardProps` contract, behind its own subpath because
  it's the one entry that needs React (its transport DTOs are generic params too).
- `@game-hub/kernel/bot` — the bot helpers above (framework-free, no React).

**Why the structural host types exist.** A game package can't name the backend's concrete
`ModuleContext`/`GameHub`/`BotRepository` without importing `@game-hub/backend` — a workspace cycle. So
the kernel defines *minimal structural interfaces* for the two host generics a module actually uses:
`ModuleHub` (just `broadcastEach`) and `ModuleBotSeats` (`listForGame` + `difficultiesForGame`). A package
binds `ModuleContext<Db, ModuleHub, ModuleBotSeats>`. ⚠️ The backend proves its concrete `GameHub` /
`BotRepository` satisfy those structural surfaces with a **compile-time assertion** in
`backend/src/games/module.ts` — so any drift is a type error in the host, not a runtime surprise. The
kernel still imports no host.

**Version-compat idea (for a future out-of-repo game).** The kernel's **major version is the contract
version**; a game manifest would declare `kernelContract: N` and the registry would refuse a mismatch
loudly at registration. Additive optional hooks = minor bump (old games keep working); changing a required
member's meaning = major. A game's own state-shape evolution stays its own business via
`schemaVersion`/`migrate` — deliberately orthogonal to the kernel contract version. This is not yet
enforced (all games are in-workspace); see `track-d-externalize-games.md` §4.

**Adding a game is one entry in `games.config.ts` + `pnpm generate`.** That root file is the ordered list
of `{ id, module, client }` (import specifiers that default-export the module/client). `pnpm generate`
turns it into two **checked-in** files — `backend/src/games/index.generated.ts` and
`ui/src/games/registry.generated.ts` — that a **CI freshness check** re-runs and `git diff --exit-code`s.
The registration invariants (duplicate-id boot crash, `minPlayers ≤ maxPlayers`, config order) live in the
hand-written registry the generated file feeds.

---

## 8. The extract-on-the-third-example restraint rule

**Extract the genuinely-common shapes; resist the coincidental ones.** We do not build an abstraction off
one example — an abstraction designed off a single example fits one game and no others.

What we **refused** to extract off one/two examples, and still refuse:

- **A generic sealed-multi-seat-input framework** off Container's delivery auction. It stays
  Container-shaped behind `routes`/`pendingStep`. If a second game needs the same shape, extract it *then*.
- **A shared `record`/state/`viewFor`** off two games. Each game keeps its own state type, constants and
  `viewFor` — redaction must be an explicit per-game decision, not a shared no-op.

What the rule said to extract **once the third example arrived** (architecture review §3), and did:

- **`record()` and the seat helpers** (`seatOf`/`withPlayer`/`activePlayer`) were byte-identical across
  three games → the kernel's `record` + `makeSeating`.
- **The "game is over" shape** had drifted three ways (Container `results: []` while active, Stone Age
  `results: null`, Can't Stop no `results`) → the kernel `GameEndState` discriminated union. A game's state
  now *intersects* it (`… & GameEndState<PlayerScore>`), so the `active` arm carries no `results` and
  `{ status: 'ended', results: [] }` is unconstructable; read sites narrow on `status`. Can't Stop, with
  nothing to tabulate, takes the winners-only `WinnersEndState` arm rather than an invented empty results.
- **The bot `decide` preamble and the self-play runaway guard** → `assertBotTurn` / `makeProgressGuard`.
- **`runBotLoop`** — already structural (reads a structural `BotLoopState`, imports no host) → kernel.

What deliberately **stays per-game even so:** `viewFor` (redaction is an explicit decision) and the
`legalActions` preamble (Container admits off-turn `REQUEST_LOAN`).

---

## 9. Testing strategy

Tests ship *with* the code, not after — a feature without tests isn't finished.

- **Engine: 100% statements/branches/functions/lines**, enforced per game by a `src/engine/**` glob
  threshold in the package's `vitest.config.ts`. Every rule and every rejection path gets a test — this is
  the primary correctness guarantee. Excludes: barrels, type-only files (`core/types.ts`,
  `actions/action.ts`), `tests/**`.
- **Bot: 90%**, a `src/bot/**` glob threshold in the same config, plus self-play (thousands of live engine
  actions per game — the real test). 90% is deliberate (see §6).
- **Backend: integration tests** via `app.inject` against an in-memory SQLite DB — HTTP contract,
  validation, persistence, error mapping. Seed `AppOptions.rng` for deterministic rolls. **⚠️ The honest
  test is `module-seam.test.ts`**, which drives a stub *counter* game through the core: Container's own
  tests pass fine even if the core is secretly hardcoded to Container — only a second game can tell. It
  caught the repository reading `state.version`. Keep it working. Each game also has a REST coexistence
  suite proving it plays *and* coexists with the others.
- **UI: Playwright e2e** (Chromium desktop + Pixel 5 mobile) for real user flows, plus a **responsive**
  spec asserting layout reflow and no horizontal overflow at 320px, plus **visual-regression** baselines
  (`e2e/visual.spec.ts` — board only, deterministic at start; snapshots are per-OS `-darwin`, regenerate
  with `--update-snapshots`). Testids (`start-game`, `board`, `player-card-<id>`, …) are stable contracts —
  keep them; Playwright depends on them. `architecture.spec.ts` enforces the shell-imports-no-game seam.
- **⚠️ Playwright runs at `workers: 4`, deliberately.** The default (6 × 2 projects) resets Vite's dev WS
  proxy under load, stranding a page without live state and timing the spec out. It's a dev-server limit,
  not a product bug (production has no Vite). If specs start flaking with "waiting for <testid>" 30s
  timeouts, check the worker count before hunting a race.

The kernel has its **own** Vitest + 100% gate (its runtime primitives — `record`/`makeSeating`/`GameError`
/`runBotLoop` — need the same discipline they had inside the engine).
