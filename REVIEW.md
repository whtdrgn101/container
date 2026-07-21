# Platform review — three games in

A deep review of the Game Hub platform, architecture, and engineering practices, taken at the point
where three games (Container, Can't Stop, Stone Age) are complete and a fourth is being considered.

Reviewed: engine, bot, backend, UI, plus testing/CI/ops. Findings are grouped by tier, roughly in the
order they're worth acting on.

---

## Headline

**The platform architecture is good, and the seams held.** Three structurally dissimilar games —
hidden-info economic (Container), pure-random push-your-luck (Can't Stop), worker-placement
(Stone Age) — run side by side on one server. `app.ts` and `repository.ts` read no field off a game
state. The UI shell doesn't know what a container is, and the build proves the lazy-board boundary
works: three separate board chunks (8.08 / 31.10 / 41.44 kB) and none of the engine on the landing
screen. 552 tests green in 5.3s, zero `any`, zero `@ts-ignore`, clean `pnpm audit`.

That's a high floor. Two things qualify it:

1. **The polish conceals four live bugs** (Tier 1). Each is guarded today by an invariant that holds
   only at one call site, or by a code path nobody has exercised.
2. **The "extract when a third game makes it common" rule has now actually fired** — in the engine
   kernel, in the UI board layer, and in the bot runners. The rule has paid off (three games, no
   shared-framework damage), but it only stays a real rule if it triggers. Declining now converts a
   deliberate principle into a permanent no.

---

## Progress

- [x] **Tier 1 — live bugs** (1.1–1.5) — done, commit `1c11157`
- [x] **Documentation drift** — done: Stone Age is first-class throughout CLAUDE.md; the Can't Stop
  bot and the fired "extract on the third game" rule are recorded; the stale Decisions-log entries are
  corrected.
- [~] **Tier 2 — CI + inverted risk allocation** — partial:
  - [x] 2.1 CI pipeline — test → e2e → build + push to Docker Hub (`.github/workflows/ci.yml`)
  - [x] 2.2 Linux visual baselines — generated in the pinned Playwright container; e2e now gates the push
  - [x] 2.3 backend coverage gate
  - [x] 2.4 SPA-fallback test
- [~] **Tier 3 — kernel/board/bot extraction** (do before game 4)
  - [x] 3.2 kernel extraction — `record()` + seat helpers
  - [ ] 3.1 end-state discriminated union
  - [ ] 3.3 UI shell fields + shared board components
  - [ ] 3.4 hoist the bot drive-loop
- [ ] **Tier 4 — ops hardening**
- [ ] **Tier 5 — worth knowing**

---

## Tier 1 — Live bugs ✅ (done — commit `1c11157`)

### 1.1 A throwing bot permanently 500s a game, on the read path ✅

`tick()` (`backend/src/app.ts`) has no `try`/`catch`, and it runs on `GET /games/:id` and on WS
subscribe, not just on mutations. A `BotError` is not a module domain error, so `mapError` returns
`null` and it bubbles to a 500.

Because the tick is on **read**, the game becomes permanently unreadable *and* unplayable — and no
human can unstick it, because it isn't their turn. The only escape is `POST /games/:id/abandon`,
which happens not to tick.

No live repro was constructed: `countRange` guards `available < 1` in the engine, which keeps the
bot's `pickPlacement` non-null assertion safe. But that invariant lives in the **engine** while the
assertion depending on it lives in the **bot** package, with no test tying them together — exactly
the coupling that breaks silently on a rules change.

**Fix:** contain the error in `tick()`. A bot that can't decide should stall its own seat, not take
down reads of the game.

### 1.2 Stone Age mechanics take `playerId` but act on `activePlayerIndex` ✅

Five of Stone Age's seven mechanics (`feed`, `use`, `take`, `build`, `acquireCard`) resolve the seat
from `state.activePlayerIndex` rather than from the `playerId` argument. Container does the opposite
and is correct (`seatOf(state, playerId)`).

`applyAction` guards this today. But **all seven are public exports** from the game's barrel, and the
bot and UI import from that barrel. `feed(state, 'p2')` while p1 is active feeds **p1** and writes
`playerId: 'p2'` into the log — a silent wrong-player mutation with a falsified audit trail, which is
precisely the class of bug the append-only log exists to catch.

**Fix:** use `seatOf(state, playerId)` in all five, matching Container. Turns latent silent
corruption into a `PLAYER_NOT_FOUND` / `NOT_YOUR_TURN` throw.

### 1.3 The Stone Age bot pays for buildings with its lowest-value resources ✅

Building points **are** `paymentValue` (wood 3, brick 4, stone 5, gold 6), while an unspent resource
is worth 1 point at game end. So spending gold on a building converts 1 pt → 6 pts; wood, 1 pt → 3.

But `buildingPaymentFor` calls `takeCheapest`, which iterates resources in **ascending** value order
— so the bot systematically pays "any N" buildings with its cheapest resources and scores the minimum
the tile can pay out.

The tell that this is a bug rather than a taste call: **the same helper is correct for cards.**
A card's cost is a pure toll that awards no points, so shedding the cheap stuff is right there. One
helper, two call sites, opposite correct answers.

**Fix:** split into `takeCheapest` (cards, tolls) and `takeRichest` (building payments).

### 1.4 `MAX_STEPS` exhaustion is silent in production, loud only in self-play ✅

All three bot runners cap iterations and then fall out of the loop with no signal. Self-play **throws**
on the same condition ("a policy is cycling"). The production path is the one that swallows it.

A legal-but-non-progressing action would burn up to 20,000 iterations — each a DB read, an
`applyAction`, a DB write and a WS broadcast — on **every HTTP GET of that game**, then return a
normal 200. A self-inflicted DoS with no log line.

**Fix:** log loudly on exhaustion. (Hoisting the loop, §3.4, then puts this in one place.)

### 1.5 Two test gaps that hide deploy-breaking regressions ✅

- **The `game_type` migration is unasserted.** `abandon.test.ts` does genuinely good work — it builds
  a real pre-column database on disk and reopens it — but the legacy DDL omits *both* added columns
  while the test only asserts `abandoned_at`. Delete the `game_type` entry from `ADDED_COLUMNS` and
  every test still passes, yet every deployed database breaks on the first `moduleOf` query.
- **A vacuous assertion.** `expect(...listMoves(id).length).toBeGreaterThanOrEqual(0)` is true for
  every possible array. It reads as coverage in a grep and asserts nothing.

---

## Tier 2 — No CI, and inverted risk allocation ✅

### 2.1 There is no CI ✅

> **Done.** `.github/workflows/ci.yml` runs on every push to `main`: a `test` job (`pnpm typecheck` +
> `pnpm test` — engine 100% / bot 90% / backend coverage-gated) and an `e2e` job (full Playwright suite
> in the pinned container) both gate a `docker` job that builds the image and pushes
> `whtdrgn101/game-hub:latest` + `:v<run-number>` to Docker Hub (secrets `DOCKERHUB_USERNAME` /
> `DOCKERHUB_TOKEN`), with a GHA layer cache.

This is the top *process* finding, because every gate in this repo is voluntary — the 100% engine
gate only fires if someone remembers to run it locally, on a clean tree.

Note also that root `pnpm test` is `pnpm -r test` and **`ui` has no `test` script**, so `pnpm test`
covers zero UI code. That's the most misleading thing in the command table.

Recommended pipeline (push + PR, Node 22 to match `.nvmrc`/`Dockerfile`): `typecheck` → `test` →
`test:e2e` (with `playwright install --with-deps chromium`) → `docker build`. Keep thresholds where
they are, in each package's vitest config; CI should *run* the gates, not redefine them.

### 2.2 The visual spec is guaranteed-red on Linux ✅

> **Done.** Generated `-linux` baselines for both projects **inside** the pinned Playwright container
> (`mcr.microsoft.com/playwright:v1.61.1-jammy`) and committed them next to the `-darwin` set, and the
> CI `e2e` job runs in that same image so rendering matches bit-for-bit — verified by a fresh
> comparison run (2 passed, no `--update`). `ui/e2e/README.md` documents how to regenerate them. Note:
> the image ships Node 24, so the job installs a C toolchain to compile better-sqlite3 (no Node-24
> prebuild); the app still ships on Node 22, which the unit `test` job certifies.

Verified: full e2e is **110 passed, 2 failed, 52.7s**, no flakes at `workers: 4`. Both failures are
`visual.spec.ts` — only `-darwin` baselines are committed, and Playwright keys snapshots on
**platform**, which the spec's comment doesn't account for. This spec is effectively dead anywhere
but the original Mac and will be born red in CI.

Fix properly by generating Linux baselines in the Playwright container image and committing both.
Cheap interim: skip when `process.platform !== 'darwin'` so it isn't a false red.

### 2.3 The backend has no coverage gate — and coverage can't be measured ✅

> **Done.** Added `@vitest/coverage-v8` to the backend, switched its `test` script to
> `vitest run --coverage`, and set an honest floor in `backend/vitest.config.ts` (statements 94 /
> branches 83 / functions 92 / lines 94 — just under the measured 96.5 / 85.8 / 94.8 / 96.5), excluding
> the type-only `games/module.ts` contract and the `server.ts` bootstrap. Ratchet up, never down.

`backend/vitest.config.ts` has no `coverage` key, the script is a bare `vitest run`, and
`@vitest/coverage-v8` is a devDependency of **engine and bot only**.

This is inverted risk allocation. The engine is a pure function library held to 100%; the backend —
which owns all I/O, migrations, the WS transport, error mapping, and the viewer/redaction plumbing —
is held to nothing and has never been measured. The strong engine number creates a false impression
of coverage over the layer where the real hazards live.

### 2.4 The production-only serving path is executed by nothing ✅

> **Done.** `backend/src/tests/staticServing.test.ts` boots `buildApp({ db, staticDir })` against a
> fixture UI dir and pins the contract: unknown non-API GETs return `index.html`; every allowlisted API
> prefix (`/games`, `/lobbies`, `/health`) stays JSON — an unknown game is a JSON 404, not the SPA shell;
> a non-GET unknown route is a JSON 404. A dropped allowlist entry now fails a test instead of silently
> returning HTML with a 200.

`staticDir`/`UI_DIST` appear nowhere in the backend tests. That path runs only in the Docker image;
Playwright runs against the **Vite dev server with an `/api` proxy**, the opposite configuration.

The sharp edge is the SPA-fallback allowlist regex in `app.ts`. CLAUDE.md explicitly says "when
adding a top-level API route, update this regex" — and nothing enforces it. Add a `/rematches` route
and it silently returns `index.html` **with a 200**: health checks pass, the UI just breaks
mysteriously.

One test booting `buildApp({ db, staticDir })` against a fixture dir closes the
highest-severity/zero-detection gap in the repo.

---

## Tier 3 — The extraction rule has fired (do before game 4)

Each of these gets more expensive per game added.

### 3.1 Three games disagree on how "the game is over" is represented

| Game | End-state fields |
|---|---|
| Container | `status`, `results: PlayerScore[]` (**`[]` while active**), `winnerIds` |
| Can't Stop | `status`, `winnerIds` — **no `results` field at all** |
| Stone Age | `status`, `results: StoneAgeResult[] \| null` (**`null` while active**), `winnerIds` |

The empty-vs-null split is arbitrary, and both admit illegal positions:
`{ status: 'ended', results: [] }` and `{ status: 'ended', results: null }` are both constructible
and both meaningless.

**Recommendation:** a discriminated union, so `ended` and `results` can't disagree:

```ts
| { readonly status: 'active' }
| { readonly status: 'ended'; readonly results: readonly R[]; readonly winnerIds: readonly string[] }
```

Highest-value type change available in the package. Game 4 will otherwise invent a fourth convention.

### 3.2 `record()` and the seat helpers are literally identical code ✅

> **Done.** `record()` now lives in `engine/src/kernel/record.ts` (generic over `VersionedState`), and
> the seat helpers in `engine/src/kernel/seating.ts` as `makeSeating<P>(onMissing)` returning
> `{ seatOf, withPlayer, activePlayer }`. Can't Stop and Stone Age re-export the kernel `record`
> verbatim; Container keeps its `players`-first wrapper delegating to it (14 call sites). Each game binds
> `makeSeating` to its **own** `GameError` subclass via the injected `onMissing` thrower — so
> PLAYER_NOT_FOUND stays `instanceof` the subclass the backend's `mapError` checks, avoiding the
> 404→500 trap with **zero backend change**. Engine 100% (kernel files included); bot + backend green.

`cantstop/internal/record.ts` and `stoneage/internal/record.ts` are byte-identical after normalizing
the state type name and comment; Container's differs only by a redundant hoisted `players` parameter
already reachable through `changes`. `seatOf` / `withPlayer` are identical three ways; `activePlayer`
identical in two.

The comment in `cantstop/internal/record.ts` justifying the copy ("one worked example isn't enough to
abstract over") has expired. The shape is structural — `{ version: number; log: readonly MoveRecord[] }`
— not semantic; nothing about a fourth game could make "bump version, append one log entry" mean
something different.

**⚠️ One trap:** each `seatOf` throws its *own* game's `GameError` subclass, and all three backend
`mapError`s discriminate on exactly that. A kernel `seatOf` throwing the kernel base class is
`instanceof` **none** of them, so all three return `null` and the core **500s instead of 404ing** on
`PLAYER_NOT_FOUND`. Extract with the error constructor injected, or give `mapError` a base-class
fallback — and cover it in the backend tests.

Also worth moving into the kernel on the same evidence: a structural `SeatedGameState` interface
(present verbatim in all three, and would have caught §3.1 at compile time), `shuffle` (Fisher–Yates
is duplicated *within Stone Age alone*), `assertPlayerCount`, and a `recordOf` helper to remove the
six `{} as Record<K,V>` casts.

**What should NOT move in, despite looking similar:** `viewFor` (two identical no-ops, but the seam's
value is that redaction is an explicit per-game decision — a shared `noRedaction()` makes "this game
has no secrets" and "I forgot to redact" the same line of code); `legalActions`'s preamble (Container
deliberately breaks it — an off-turn seat may still `REQUEST_LOAN`, rulebook pg. 16); and a shared
bot `rank`/`decide` scaffold (see §3.4).

### 3.3 The UI shell duck-types game state, and three boards re-implement platform rules

`App.tsx` casts `players` straight off the opaque state to get seat names for the tab title and
rematch. The `version` guard in `useGameTransport` is documented and defensible; this isn't. A game 4
that calls them `seats` breaks the header with no type error. `GameSummary` already models this
correctly — put the same fields on `GamePayload` and have `summarize` fill them.

That fix unblocks the rest, because the only reason the shell can't compute these is that it lacks
`activePlayerId`:

- **`canDrive` is character-for-character identical in all three boards.** It's a *platform* rule
  (seat binding + bot seats), and CLAUDE.md treats it as one.
- **`myNames` likewise — and Stone Age never computes it**, which is why that game has no "You are X"
  display at all. Seat-binding UX silently missing from a game because the rule was copy-paste.
- **Three turn banners**, one of which (Stone Age) shows the phase but not who you are. **None is
  `role="status"` or `aria-live`**, so no screen-reader user in any game is told it's their move.
- **Three activity feeds.** Container has a real component (scrollable, 60 entries, bot badges); the
  other two are near-identical inline JSX capped at 6 with no bot badges. The genuinely per-game part
  is one function: `describe(move) => string | null`.

The shared `components/GameOver.tsx` — used correctly by all three — is the precedent and the model.

### 3.4 Hoist the bot drive-loop; do not hoist `decide`

The three runners are the same ~15 lines modulo the `decide` import and the roll shape; Container's
adds one auction pre-step. A core `runBotLoop({ get, botSeats, isActiveBot, step, maxSteps })` would
reduce two of them to a `step` function.

The argument isn't tidiness — it's that **§1.1 and §1.4 then live in one place instead of three**.

**Do not extract a shared `rank`/`decide` scaffold.** Only Container's is actually
"legalActions-then-rank": Can't Stop's roll/stop branch is a closed-form EV test with no ranking at
all, and Stone Age's argmax is over *places*, not actions. Forcing them into a shared `Candidate`
shape would be abstraction-by-analogy — the exact thing this codebase has been right to avoid.

Two smaller things *are* genuinely common and safe now: the `decide` preamble (ended-check +
not-your-turn check, byte-identical three times) and the self-play cycling guard (same three times,
with Stone Age's variant subtly weaker — no per-turn detection, so it runs 100,000 actions before
complaining instead of 500).

---

## Tier 4 — Ops: what breaks the home server first

### 4.1 There is no state-schema migration story

There's a solid *column* migration path (`ADDED_COLUMNS` + `addMissingColumns`), but game state is an
opaque JSON blob persisted forever on the `/data` volume, with no `schemaVersion` and no `migrate`
hook on `GameModule`. The moment a shipped game's state shape changes, every in-flight game in a
deployed database deserializes into an engine that no longer matches it, and nothing detects it.

This is the gap most likely to actually bite, because it bites on **iteration**, not on adding games.

### 4.2 `version` is documented as optimistic concurrency and never used for it

Both `types.ts` files say "Used for optimistic concurrency". `POST /games/:id/actions` takes no
expected version, and the repository writes unconditionally. A double-click or a client retry applies
the action twice.

Related, and worth a code comment: the handler is currently race-free only **accidentally** — there
is no `await` between load and update, and better-sqlite3 is synchronous, so it runs atomically.
Adding a single `await` to that block silently introduces a lost-update race.

### 4.3 `listOpen()` has no LIMIT, and lobbies are never deleted

Every lobby row ever created is selected, `JSON.parse`'d and filtered **in JS** — while the home
screen polls `GET /lobbies` **every 3 seconds per visitor**, and nothing ever deletes a lobby, on a
volume explicitly designed to persist across updates.

The game repository got this right (SQL filter, `LIMIT 50`, with a comment explaining why);
`listOpen` got neither. Compounding it: **`db.ts` defines no indexes at all**, and both
`games ORDER BY updated_at` and `lobbies ORDER BY created_at` are polled every 3s.

Most likely cause of a gradually-slowing home server.

### 4.4 No graceful shutdown; the health check checks nothing

No `SIGTERM`/`SIGINT` handler anywhere — `docker stop` cuts in-flight requests and never calls
`app.close()` or `db.close()`. WAL makes this crash-*safe*, but not clean.

`/health` returns a literal constant and never touches the database, so if the volume is unmounted or
the file is locked or corrupt, the compose healthcheck stays green and `restart: unless-stopped`
never fires. It proves only that the event loop is alive.

**And the documented backup is unsafe:** DEPLOY.md recommends `docker cp` of the main SQLite file,
but the DB runs in **WAL mode** — copying it alone while the server runs omits everything in the
`-wal` sidecar, giving a silently stale or torn backup. Use `VACUUM INTO` (atomic, WAL-correct, works
on a live DB).

### 4.5 The image ships the dev toolchain, as root

`COPY --from=build /app /app` brings the whole build stage, including ~205 MB of `node_modules`
carrying vitest, typescript, tailwind, vite and Playwright. No `USER` directive, no `HEALTHCHECK` in
the image itself (only in compose, so `docker run` users get none), no memory/CPU limits or log
rotation in compose.

**Trap worth a comment in the Dockerfile:** `CMD` runs `tsx src/server.ts` and **`tsx` is a
devDependency**, so the image *must* keep devDependencies — a future `--prod` optimization silently
breaks the container at startup. Slimming it properly means compiling the backend with `tsc`; note
`backend` currently has **no `build` script at all**, so `pnpm build` skips it.

### 4.6 Security footguns (the no-auth choice is fine; these are orthogonal)

Validation is genuinely consistent — every body-taking route has a Fastify schema and all SQL is
parameterized. Real gaps:

| Risk | Mitigation |
|---|---|
| No rate limiting anywhere; rows are never deleted (§4.3) | `@fastify/rate-limit`, generous global cap |
| **WS has no origin check** — WS is exempt from CORS, so any page a LAN user visits can open `/games/:id/stream` and read projected state | `Origin` allowlist |
| No WS connection cap or heartbeat; the hub's `rooms` map is unbounded | per-IP cap, `maxPayload`, ping/pong to reap half-open sockets |
| Unbounded strings — no `maxLength` on names, no `maxItems` on `players`. A 1 MB name is stored in state JSON and echoed on every 3s poll | `maxLength: 64`, `maxItems` |
| `bodyLimit` not set explicitly (default 1 MiB is fine) | pin it |

---

## Tier 5 — Worth knowing

- **No linter or formatter of any kind** — no ESLint, Prettier, editorconfig, or hooks; no `lint`
  script in any package. Yet **8 `eslint-disable` comments exist for a linter that isn't installed**,
  including two suppressing `react-hooks/exhaustive-deps`. They are inert, and they create a false
  impression that something is checking. That's the exact rule that would protect the ref-vs-dep
  arrangement in `useGameTransport`.
- **Container's auction side-channel has a real fetch race** — the effect refires on `auctionKey`
  changes with no cancellation, and three paths write the same setter, so responses can land out of
  order. `App.tsx` already does this correctly with a `live` flag for rematch. It matters mainly
  because it's the template game 4 will copy for its own side-channel.
- **`e2e/architecture.spec.ts` hardcodes the game list** in a regex alternation. Adding game 4 means
  editing the test meant to catch game-4 mistakes — and forgetting makes it silently weaker rather
  than failing. Derive it from `readdirSync`.
- **`app.ts` is the file that grew back** — 718 lines holding games, abandon, rematch, lobbies, WS and
  static serving in one closure. Same monolith shape C2 fixed in `App.tsx` (1895 → 364).
- **`backend/src/tests/app.test.ts` is 1196 lines** and violates the repo's own "well under 1000"
  rule. A second header block sits mid-file, so a second suite is already living inside it. The
  backend never adopted the engine's `tests/helpers.ts` convention; `mulberry32` is duplicated
  verbatim across three test files.
- **Bot strength is entirely unmeasured.** Every self-play test asserts only legality and termination.
  Container's is the exception and the model — it asserts the whole trade chain runs and ≥3
  deliveries happen, precisely because the ships-never-sail bug taught that lesson. Neither other game
  has an equivalent.
- **Stone Age heuristics have several exploitable cliffs** beyond §1.3: tools are effectively never
  built (scored below every resource place), huts are cut off by a hard `round <= 2` check, all
  buildings and cards are scored as fungible constants regardless of payout, and resource preference
  favours gold when wood yields twice the points per worker unless the gold is spent well.
- **Container's `Action` markers force four runtime re-checks.** `legalActions` returns bare markers
  of the same type, so fields must be optional, so every consumer re-proves they're present. Stone Age
  already solved this better (markers as *valid empty values*). Container is the outlier — and it's the
  game a fourth game is most likely to be copied from.
- **Stone Age ships the undrawn `cardDeck` to every client** — its own `view.ts` comment admits it.
  Any client can read the next four civilization cards. Small stakes, but real.
- **Stone Age's 2–3 player rules are deferred** while `MIN_PLAYERS = 2` and the roadmap calls the game
  complete. A 2p game offers 4p capacities everywhere — materially not Stone Age at 2p, and the first
  thing a playtester will hit.
- **Immutability is asserted only in Container.** CLAUDE.md states the invariant as tested; neither
  newer game has such a test. Both are in fact clean, but Stone Age is the most exposed (it does the
  most nested-record rebuilding).
- **Test helper typing regressed in the newer games** — Container's `expectError` is compile-checked
  against its error union; Can't Stop's and Stone Age's both take a bare `string`, so a test asserting
  a code that no longer exists stays green.
- **`MoveRecord.type` is stringly-typed**, discarding each game's precise `ActionType` union. The UI's
  log filters on string literals with no compile-time link to the engine.
- **Dependencies are clean but stale** — `pnpm audit` finds nothing, but vite is 2 majors behind,
  vitest 1 major (must move in lockstep across three packages), and better-sqlite3 is the one bump
  that can break the Docker build. `@types/node` at 22 is correct as-is.
- **`reference_materials/*.pdf` is gitignored** (correctly — large and copyrighted) while 9 committed
  files instruct readers to consult it, including 4 `TODO(verify)` items only resolvable with files a
  fresh clone can't obtain. Worth a README line saying so.

---

## Documentation drift ✅

> **Done.** CLAUDE.md now treats Stone Age as a first-class third game throughout (architecture tree,
> the `GameModule`/`GameClient` seams, engine subpaths + Vite aliases, the bot package, and the
> "building a new game" recipe). Corrected stale claims: Can't Stop has a bot (CS1); the "extract when a
> third game makes it common" note records that the rule has fired (record()/seat helpers) and points
> here; the action-model convention no longer implies Container's 2-action budget is universal; and the
> Decisions log reflects that online multiplayer and AI both shipped. Stone Age mentions went 1 → 22.
> The embedded ⚠️ working-rules in the roadmap history were **kept in CLAUDE.md** (load-bearing); a
> fuller relocation of pure history into ROADMAP.md remains available as an optional follow-up.

CLAUDE.md is 678 lines and mentions Can't Stop 32 times and **Stone Age once**. It still states that
Can't Stop has no AI (CS1 shipped one), and the "GameClient seam", "bot package" and "Building a new
game" sections all describe a **two-game** platform.

Since that file is what steers future sessions, its drift compounds: a stale architecture doc will
actively misdirect work on game four. Worth a pass to (a) fold Stone Age into the seam sections as a
first-class example, (b) move the long per-slice history into ROADMAP.md, where it already partly
lives, and (c) keep CLAUDE.md to the working rules.

---

## Suggested order

1. **Tier 1** — live defects, roughly a day.
2. **CI** (§2.1), fixing or skipping the visual spec (§2.2) so it isn't born red.
3. **Backend coverage gate** (§2.3) + the SPA-fallback test (§2.4) — makes the rest visible.
4. **§4.3 / §4.4** — cheap, and they're what actually degrades the home server.
5. **Tier 3** — as a deliberate "platform hardening" slice, before game 4.

Visual polish is best held until after Tier 3: §3.3 and §3.4 are exactly the shared-component
groundwork that polish would otherwise get done three separate times.
