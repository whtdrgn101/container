# Roadmap — the platform

This is the **platform & engine roadmap**: the seams that make the site a *games room* rather than one
game, and the higher-level "which games, and what's left of them" view. Game-specific slices live in
**per-game roadmaps** — and since 2026-07-31 every game is out-of-repo, so those roadmaps now live in each
game's own repository (`whtdrgn101/game-<id>`), not here:

| Game | Status | Roadmap |
|------|--------|---------|
| **Container** | core game complete; AI A0–A2 shipped, A3–A5 remain | [`whtdrgn101/game-container`](https://github.com/whtdrgn101/game-container) |
| **Can't Stop** | complete: playable, AI (CS1) + art/a11y polish (CS2) + difficulty tiers (CS4) shipped; only optional variants (CS3) remain | [`whtdrgn101/game-cantstop`](https://github.com/whtdrgn101/game-cantstop) |
| **Stone Age** | **complete** (SA0–SA15): full worker-placement game — placement, gather+tools, buildings, civ cards, feeding, game end + scoring, an illustrated zoomable board, an AI bot, the pg. 8 2–3-player restrictions (SA14), and card-deck redaction (SA15) | [`whtdrgn101/game-stoneage`](https://github.com/whtdrgn101/game-stoneage) |
| **Russian Railroads** | **in build** (game 5, Ultimate Railroads edition — and the Track D pilot: the first *package-shaped* game, `@game-hub/game-russianrailroads`). RR0–RR8 **base game complete** (worker placement, track advancement, locomotives, engineers, game end + final scoring); RR9 art **shipped**; RR9b — board-UI revamp (the shipped board is too crowded to play well — owner call 2026-07-28) queued behind the Labyrinth/D2 kickoff and should borrow its board-UI findings; RR10 bot after; expansion modules after that. Rules digest done (48 pp. read; hidden info = one secret end-bonus card/player; all base randomness setup-only; the legalActions hazard = split-move combinatorics, resolved by the pending-lock ruling) | [`whtdrgn101/game-russianrailroads`](https://github.com/whtdrgn101/game-russianrailroads) |
| **Saint Petersburg** | **complete** (SP0–SP9, game 4, 1st edition) — including the "Malachite & Gilt" board art (SP8, comps-approved) and the platform's first redacted-view bot (SP9, greedy baseline): **SP0–SP7 shipped** — registered, viewable fourth game with redacting `viewFor` (hands *and* rubles secret) + the 116-card deck data (SP0), the playable **phase spine** — `BUY`/`PASS`, turn order, cumulative cost reductions (min 1 ruble), all-pass phase close with scoring + refill, interactive board (SP1), the **full round loop** — trading-phase frame (no scoring), round transition (discard lower, slide upper→lower, deal workers, rotate all four markers left) with the pg. 8 "no cards taken → skip the *mid-round* refill" special case (round-end worker deal unconditional — a drain-spiral bug corrected in SP3), marker chips + rollover feed (SP2), the **hidden hand** — `ADD_TO_HAND` (free, limit 3) / `PLAY_FROM_HAND` (cost with reductions, no lower-row discount), non-empty-hand redaction proof, playable-hand UI + face-down opponent counts (SP3), **trading-card displacement** — `BUY`/`PLAY_FROM_HAND` take a `displace` card-id (green ware-pairs incl. Czar-by-any-green, blue→any building, orange→any aristocrat, never trading-on-trading), cost = difference-or-1 with all reductions, carpenter-workshop/gold-smelter owned-card reductions live, UI displacement picker + upgrade feed (SP4), and the **six special cards** — Warehouse (hand limit 4), Mariinskij (+1₽/aristocrat at building scoring), Tax man (+1₽/worker at aristocrat scoring), Potjomkin (buy 2, worth 6 when displaced), the **Pub** interlude (after building scoring, buy ≤5 pts @ 2₽) and the **Observatory** (skip its point to draw a stack top → forced buy/hand/discard), both as engine-level turn locks (`pendingPubBuy`/`pendingDraw`, no backend routes; the draw is a pure engine action, `pendingDraw` publicly revealed like an SP3 take), engine 476 @ 100% + seeded backend REST proof (SP5), and **game end + final scoring** — a `finalRound` flag armed when a board refill places a group's last card (pg. 5; dealing short of a *pre-empty* stack is not the trigger; the round-end worker deal arming it makes the fresh round "this round"), ending at the final round's trading close into `finalScoring` (distinct-aristocrat table 1/3/6/10/15/21/28/36/45/55 by card identity incl. orange trading cards, +1/full 10₽, −5/hand card, **unclamped**; ties by money then shared), `viewFor` revealing all at `ended`, and the shared `GameOver` results table (SP6), and **playable-game hardening** — full seeded games driven to a real end over REST at 2/3/4 players (whole surface: both rows, add+play hand, a trading displacement, a paying Pub buy, an Observatory draw+resolve; coherent breakdowns, monotonic version, sane move log), the honest **four-games-coexist** check (all four real games + the counter stub in one app; the routeless `stpetersburg` namespace 404s cleanly while cross-game calls stay guarded), lobby+colours / resume / abandon proven in e2e, the **seat palette** on the board, a `describe(move)` audit, and a `legalActions⊆applyAction` fuzz (SP7); then the approved **art** (SP8) and the redacted-view **bot** (SP9) — see the per-game roadmap for both | [`whtdrgn101/game-stpetersburg`](https://github.com/whtdrgn101/game-stpetersburg) |

| **Labyrinth** | **playable** (game 6, and the Track D **out-of-repo** proof — the first game built in its own repository, `whtdrgn101/game-labyrinth`, against the published `@game-hub/kernel` + `@game-hub/ui-kit`, and hosted here as an **installed package resolving to compiled `dist/`**). L0–L4 shipped: the engine (tile deal, the 12-arrow slide with the no-reverse rule and pawn wraparound, movement/reachability, treasure flips, the win), the module seam (per-seat stack redaction — your own top card, everyone else a count), and the playable board. **Remaining: L4b** (original art — the tile fills, the 24 treasure marks and the pawns) and **L5** (the bot). ⚠️ Its roadmap, rules digest, rulings and findings live in **that repo**, not here | [`github.com/whtdrgn101/game-labyrinth`](https://github.com/whtdrgn101/game-labyrinth) |

Adding a game is **additive** — implement the seams, register, done (proven six times now — Container,
Can't Stop, Stone Age, Saint Petersburg, the package-shaped Russian Railroads, and Labyrinth from
outside the repo entirely). See
[`docs/game-creation.md`](docs/game-creation.md) for the recipe and [`docs/design-patterns.md`](docs/design-patterns.md)
for how the seams work.

## Direction (owner, 2026-07-22)

The near-term order, decided while play-testing:

1. ✅ **Stone Age polish** — the pg. 8 two/three-player rules (the one knowing rules deviation left in
   a shipped game). *(Shipped as SA14; the 2p bot benchmark was re-measured and its bar re-committed
   with it — 29/32, bar 25/32.)*
2. ✅ **Game 4 — Saint Petersburg (1st ed.)** — chosen 2026-07-22 over Russian Railroads (which is queued
   as the Track D pilot: a heavyweight is the right stress test once adding games is smoother). Sliced
   SP0–SP9 in its roadmap; the first game exercising real `viewFor` redaction (hidden hands + hidden
   rubles) and continuous deck randomness.
3. **Schema versioning for state transitions** ✅ (architecture review §4.1) — `schemaVersion` + `migrate` on
   `GameModule`, a `games.schema_version` column, and write-on-read upgrades in `GameRepository`, so
   iterating on shipped engines can't strand in-flight games (downgrade rows 409, all four games are v1).
4. **Track D (new, core) — externalize games. ✅ in-workspace phase complete (2026-07-27).** Four games
   had tested the engine and the seams; the long-term goal is making games easier to add — and eventually
   addable from *outside* this repo. **Design doc:**
   **[`docs/track-d-externalize-games.md`](docs/track-d-externalize-games.md)** — the game-package
   contract (four subpath exports over a peer `@game-hub/kernel`), build-time registry codegen off a
   `games.config.ts`, kernel-major-as-contract-version, and the workspace assumptions that dissolve on the
   way out of the repo. **Delivered:** Russian Railroads was built as the first in-workspace game
   **package** (`packages/games/russianrailroads/`), then **all four legacy games were migrated onto the
   same shape** and `@game-hub/engine`/`@game-hub/bot` retired — so every game now lives in its own
   `@game-hub/game-<id>` package (migration plan + findings:
   **[`docs/track-d-legacy-migration.md`](docs/track-d-legacy-migration.md)**). **✅ COMPLETE
   (2026-07-30):** D2 — the *out-of-repo* game — landed with Labyrinth. `@game-hub/kernel@1.2.0` and
   `@game-hub/ui-kit@1.0.0` are published to npm, the game is built in its own repo against them, and the
   hub hosts it as an installed package resolving to compiled `dist/` — proven in the production Docker
   image, not just in dev. See the design doc's "Delivered in D2d" for what it cost (two dependency lines,
   one config entry) and the three things that broke first. **✅ Fully closed (2026-07-31) — the extraction
   wave.** The recorded leftover ("publish `@game-hub/game-labyrinth` so `vendor/`'s tarball can become a
   version range") is done, and it generalised: **all five in-workspace games were extracted to their own
   `whtdrgn101/game-<id>` repos and published to npm alongside Labyrinth, every game now at `0.1.0`.** The
   hub consumes all six as `@game-hub/game-*@^0.1.0` over compiled `dist/`; `packages/games/`, `vendor/`
   and the `labyrinth:refresh`/`test:games` scripts are gone, and the per-game Vite aliases + tsconfig
   includes with them (Labyrinth never had any — the proof they were unneeded). All gates green after the
   swap (typecheck, kernel+backend tests, 158 e2e, lint, format, `docker build`). See CLAUDE.md's decisions
   log (2026-07-31 entry) and `docs/game-creation.md` §6 — now the *only* path for adding a game.
5. **Russian Railroads board-UI revamp (RR9b)** (owner, 2026-07-28, while play-testing):
   the RR board fights itself — a responsive layout that works on mobile vs a game that genuinely
   needs table-top board density — and the compromise makes the game nearly unplayable. Redesign the
   board UI before the bot (RR10). Sliced in
   [the RR roadmap](packages/games/russianrailroads/ROADMAP.md).
6. **Track D D2 — game 6: Labyrinth, out-of-repo (owner, 2026-07-29). ✅ COMPLETE (2026-07-30).** D2 started
   now with *The aMAZEing Labyrinth* (Ravensburger; rulebook in `reference_materials/`), jumping ahead
   of RR9b: the game's board UI should generate the layout ideas RR9b needs anyway, and the
   grid/path-routing state is the engine workout the owner wants. Kickoff decisions (all recorded in
   [`docs/game-labyrinth-kickoff.md`](docs/game-labyrinth-kickoff.md) with the rules digest and the
   D2a–D2d + L0–L6 slice plans): **public npm** under the `game-hub` org (verified unclaimed
   2026-07-29), a **new public repo** `whtdrgn101/game-labyrinth`, **classic theme with original art**
   (Ravensburger's illustrations are copyrighted; the mechanics and treasure list are not).
   **D2a ✅ (2026-07-29):** `@game-hub/kernel` builds a real `dist` and is publish-ready at `1.0.0`
   (`publishConfig` rewrites the subpaths to `dist/`; the hosts keep consuming TS source unchanged), the
   kernel-major-as-contract-version check is live in `GameRegistry.register` with all five games
   declaring `kernelContract`, and `pnpm --filter @game-hub/kernel pack:smoke` proves the tarball works
   outside the workspace (wired into CI). The `npm publish` itself waits on the owner creating the org.
   **D2b ✅ (2026-07-29):** contract gap #1 closed — the transport DTOs
   (`GamePayload`/`GameIdentity`/`GameMessage`) now ship on `@game-hub/kernel/client` (kernel → **1.1.0**,
   contract still 1 — additive), and the shared chrome + the game-facing REST calls extract to a
   publish-ready **`@game-hub/ui-kit@1.0.0`** (React a peer, no CSS shipped, its own pack smoke in CI).
   All five game clients import only those two packages, an e2e architecture test fails the suite if one
   reaches `ui/src`, and every game package now typechecks all four subpaths standalone. §2's Tailwind
   question is answered *and measured*: ship classes in source, host adds `@source '../node_modules/@game-hub'`
   (design doc §4b). **D2c (in flight, out-of-repo):** `whtdrgn101/game-labyrinth` is scaffolded and
   building against the published packages; its findings log (`docs/d2c-findings.md` in that repo) is the
   source of the hub-side work below.
   **Hub-side response to D2c ✅ (2026-07-30) — kernel → `1.2.0`, contract still 1 (additive):**
   (a) **the colour channel** (finding §16) — `GameModule.createGame`'s players element gained an optional
   `color?: string`, and `app.ts`'s `startGame` now resolves every seat's colour *before* dealing and hands
   it in, so a game whose colour is a **rule** (Labyrinth's starting corner) can read the lobby's pick.
   No behaviour change for the five hosted games — they ignore the field, and `colors.test.ts` deals each
   twice, with picks and without, to keep it that way; the counter stub in `module-seam.test.ts` is what
   proves the pick actually arrives. (b) **the rng helpers** (finding §13) — `mulberry32` and a shared
   `shuffle(items, rng?)` now sit on the framework-free `.` barrel, and the four in-repo Fisher–Yates
   copies were replaced by it. ⚠️ **Follow-up (small, deliberately not in this slice):** eleven *test
   helpers* still hand-roll a seeded PRNG, in **two different variants** — six are byte-identical to the
   kernel's canonical mulberry32, five are a transcription drift (`s = (s + 0x6d2b79f5) >>> 0; t ^= …`)
   that produces a **different stream**. Swapping the drifted ones changes every seeded expectation that
   depends on them (e.g. the seeds chosen to make an all-bot Can't Stop game finish), so it needs its own
   pass with each seed re-verified rather than a blind find-and-replace. **Partly closed 2026-07-31:** the
   four *backend* test helpers literally named `mulberry32` (one canonical + three drifted) now import the
   kernel's canonical `mulberry32` via `backend/src/tests/helpers.ts`; the drifted-→-canonical swap was
   re-verified green (those seeds still reach their intended finishes). What remains hand-rolled is the
   `makeRng` copies in the backend's stpetersburg/russianrailroads suites and any in the now-out-of-repo
   game repos — still a seed-by-seed matter, tracked where each lives. (c) **the docs contradiction** (finding §2) — resolved at the
   time with an in-repo vs out-of-repo table in `game-creation.md` §1, since **superseded** (2026-07-31):
   with every game now out-of-repo, that doc was rewritten standalone-repo-first as a single path, and
   **peer + dev** (with the duplicate-copy failure modes spelled out) is simply *the* dependency shape.
   **D2c ✅ + L0–L4 ✅ (2026-07-30, out-of-repo):** the game repo built its engine, module seam and
   playable board against the **published** `@game-hub/kernel@1.2.0` + `@game-hub/ui-kit@1.0.0` (its CI
   installs them from the registry with `--frozen-lockfile`, which is the honest proof), 352 tests with
   the engine at 100%.
   **D2d ✅ (2026-07-30) — the hub consumes it, and this closes Track D.** The game is now installable
   (a real `tsc` build to `dist/` behind `publishConfig`, `.js` extensions in its shipped sources, and a
   `pack:smoke` that installs the tarball outside its repo and plays a game under plain `node`), and the
   hub hosts it as a **dist consumer**: two dependency lines, one `games.config.ts` entry, `pnpm generate`
   — **no Vite alias, no tsconfig include, no vitest inline entry**. Verified where it counts:
   `docker compose up --build` boots healthy, `/games/catalog` lists Labyrinth (2–4 seats, the four pawn
   colours), a full game is created and played over REST **against the container** (version increments,
   409 on a stale write, per-viewer stack redaction on the wire), and a browser driven against the image
   plays a turn while fetching exactly one of the six `Board-*.js` chunks. Three real findings, all in the
   design doc: `tsc`'s extensionless emit (game-side, fixed), Vite dev-server pre-bundling forking
   `@game-hub/ui-kit` into two copies and silently breaking the injected REST base
   (`optimizeDeps.exclude`), and pnpm fetching *registry* copies of our own packages to satisfy an
   external game's peers (`linkWorkspacePackages: true`). §2's Tailwind question is answered against a
   real host: the existing `@source '../node_modules/@game-hub'` **does** reach an installed package's
   `dist/` — no glob change. The vendored-tarball loop (`vendor/` + `pnpm labyrinth:refresh`) was the
   temporary distribution scaffold; it was **retired on 2026-07-31** when the game was published to npm and
   the whole extraction wave landed (see item 4's "Fully closed" note) — Labyrinth now installs from the
   registry like every other game.

## Principles

- **Every slice is vertical:** engine → API → UI → tests. Each ends **green and demoable** — a safe place
  to stop, commit, and check usage before the next.
- **The engine coverage gate stays at 100%** per game; the bot's is 90% (heuristics shouldn't fight a
  100% bar). Tests ship with the code.
- **Read the rulebook per mechanic** (each game's PDF in `reference_materials/`); cite page refs in
  comments. Never implement rules from memory.
- **The engine stays pure** — no `Date`, no `Math.random`. Randomness is **injected**: at setup
  (`createGame({ rng })`) and per action (`ModuleContext.rng`), so every engine is deterministic and
  replayable. A module reaching for `Math.random` is a bug.
- **Sizes** are rough pacing guidance — **S** ≈ small, **M** ≈ medium, **L** ≈ large; split an **L** at
  its noted seam for a shorter session.

---

## Track C — Multi-game platform (turn the site into a games room)

The site hosts **games, plural**, through one contract per layer. The seams were already in the right
places — the engine is a pure `state + action → state` library, `viewFor` is a generic redaction hook,
`GameHub` fans out opaque state, lobbies live outside the engine — so Track C mostly *names* those seams
and makes everything above them generic.

| # | Step | Delivers | Size |
|---|------|----------|------|
| C0 | ✅ `GameModule` interface + registry | One typed contract every game implements; Container re-registered through it. No behaviour change | M |
| C1 | ✅ `game_type` routing | The column, the backfill, `moduleOf`, namespaced module routes, a generic `GameHub` | M |
| C2 | ✅ UI shell | Game picker, per-game lazy boards, generic lobby/landing; Container's board becomes one plugin | M–L |
| C3 | ✅ Second game (Can't Stop) | Proves the seams are real — the only honest test of the abstraction | L |
| C4 | ✅ Cross-game polish | Per-game rules blurbs on the landing + a shared `GameOver` results screen both games use | M |

### ✅ C0 — the `GameModule` seam (shipped)

`backend/src/games/`: `module.ts` (the contract), `registry.ts` (the lookup), `container/` (Container as
one module). The backend core (`app.ts`, `repository.ts`) contains no Container-specific decision.

```ts
interface GameModule<S, A> {
  readonly id: string; readonly name: string;
  readonly minPlayers: number; readonly maxPlayers: number;
  createGame(opts: { id: string; players: { name: string }[]; rng: () => number }): S;
  applyAction(state: S, playerId: string, action: A): S;
  legalActions(state: S, playerId?: string): readonly A[];
  viewFor(state: S, viewer: Viewer): unknown;
  parseAction(raw: unknown): ParseResult<A>;   // validates; the route does none
  summarize(state: S): GameSummary;            // the listActive projection
  versionOf(state: S): number;                 // ─┬─ what a `games` row needs,
  movesOf(state: S): readonly MoveRecord[];    // ─┘  so the repo reads no fields
  mapError(error: unknown): ErrorResponse | null;
  pendingStep?(state: S, action: A): ErrorResponse | null;  // "that action is mine"
  routes?(app: FastifyInstance, ctx: ModuleContext): void;  // a game's own endpoints
  onStateChanged?(state: S, ctx: ModuleContext): void;      // a game's own pushes
  createBotDriver?(ctx: ModuleContext): BotDriver;
}
```

**Decision: we did not invent a generic "sealed multi-seat input" framework.** An abstraction designed off
one example fits one game and no others. Instead a module gets somewhere to put its own weirdness:
`routes` registers endpoints the core knows nothing about, `pendingStep` says "that action is a flow of
mine, refuse it at `/actions`". Container's delivery auction stays Container-shaped inside its module.
**C3 confirmed the call was right:** Can't Stop needed *none* of those hooks (no `pendingStep`,
`onStateChanged` or `createBotDriver`), and its one bit of weirdness — server-side dice — fit the existing
`routes` + injected-rng shape without a new framework.

- **`GameError` → HTTP** is `module.mapError(error) → { status, code, message } | null`; `null` bubbles to
  a 500. No shared error base was needed (each game subclasses the kernel `GameError` for its own codes).
- **Action validation** is `parseAction`'s job in full — the route's body schema is `action: { type:
  'object' }`. ⚠️ Fastify no longer pre-validates actions; don't assume it does.
- **Persistence went further than planned:** the seam test found `GameRepository` reading `state.version`/
  `state.log`, hence `versionOf`/`movesOf` — the repo reads no field off a game state at all.

**The honest test is `module-seam.test.ts`**, which drives a **non-Container stub counter game** through
the core. Container's own tests pass just as well if the core is secretly hardcoded to Container; only a
second game (the stub, and now Can't Stop) can tell.

### ✅ C1 — `game_type` routing (shipped)

**The server hosts two games at once**, which C0 had to refuse. `games.game_type` (`NOT NULL DEFAULT
'container'`, so existing rows backfill as SQLite adds the column); `moduleOf(gameId)` reads it and every
route resolves its module from the row, **never from a default**. Module routes are namespaced under
`/games/:id/<gameType>/` with a `404 WRONG_GAME_TYPE` scope guard. `GameHub` is generic — **the core
imports `@game-hub/engine` nowhere.** Lobbies carry a `gameType`; unregistered types →
`409 GAME_TYPE_UNAVAILABLE` and are skipped by `GET /games`.

### ✅ C2 — UI shell (shipped)

**`App.tsx`: 1895 → 364 lines, and it no longer knows what Container is.** The board is a real lazy plugin
(its own chunk), the landing screen reads seat bounds from `GET /games/catalog`, and `gameType` on every
payload lets the shell pick a board. The transport is generic (`subscribeGame` forwards non-state frames
to the board verbatim); the header status line is a plugin slot. **`e2e/architecture.spec.ts` enforces the
seam** — no `@game-hub/engine/*` outside `games/<game>/`, and only the registry may name a game. Pure
refactor: all e2e passed unchanged.

### ✅ C3 — a second game: Can't Stop (shipped)

The only honest test of the abstraction — a real second game beside Container on one server, deliberately
unlike it (**no hidden information**, **per-turn randomness**). Full write-up in
[Can't Stop's roadmap](packages/games/cantstop/ROADMAP.md); the platform-shaped outcomes:

- **The engine became a per-game platform.** `engine/src/` is now `kernel/` (GameError, MoveRecord,
  Viewer) + `games/{container,cantstop}/`, exported by **subpath** (`@game-hub/engine/<game>`, no `.`
  default — no privileged game). Pure refactor of Container (its 204 tests moved untouched); the package is
  **250 tests at 100% across both games**. *(Track D later moved every game into its own
  `@game-hub/game-<id>` package and retired `@game-hub/engine`; see [`docs/design-patterns.md`](docs/design-patterns.md)
  and [`docs/game-creation.md`](docs/game-creation.md) for the current shape.)*
- **One seam change: `ModuleContext.rng`.** Per-action randomness for Can't Stop's dice, injected so the
  engine stays pure — the roll is a server-only action built by a module route, refused from clients.
- **The kernel stayed tiny on purpose** — only the three cross-game primitives; each game keeps its own
  `record()`, state and `viewFor`. We did **not** extract a shared `record`/state off two examples (same
  discipline as not building a sealed-bid framework off one).
- **Proof it's real:** a two-games-side-by-side backend test, the picker auto-activating, and all existing
  e2e green.

### ✅ C4 — Cross-game polish (shipped)

The two-game hub now feels cohesive: a game's own description on the landing, and one ending for both.

- **Per-game rules blurbs.** The `GameClient` seam gained `blurb` (a one-liner) and `rules` (a few
  how-to bullets) — presentation content, so it lives on the UI plugin, not the server catalog. The
  landing's "New game" card shows the selected game's blurb and a collapsible **How to play**; the shell
  reads them via `clientFor` (the sanctioned registry lookup), naming no game.
- **Shared `GameOver` screen** (`ui/src/components/GameOver.tsx`): a generic frame — "🏁 Game over —
  <winners> win(s)!", a slot for game-specific detail, one "New game" button back to the hub — that
  **both games render**. Container's scoring table and Can't Stop's new final-standings list drop into it,
  so Can't Stop's ending went from a one-line banner to a real results screen. Generic by construction
  (names no game, imports no engine), keeping the `results`/`winner`/`new-game-end` testids the e2e rely
  on. Every future game gets a consistent ending for free.
- Per-game bot registration already worked (see the bot platform below), so C4 was purely UI consistency.

---

## ✅ Bot platform — per-game bots (shipped, with Can't Stop's AI)

`@game-hub/bot` was Container-shaped and flat — exactly where the engine and backend were before C3 — so
it was reorganized the same way to let a second game have a bot, and Can't Stop's AI (CS1) landed on top.

- ✅ **Reorganized `@game-hub/bot` per game**, mirroring the engine's C3 split: `bot/src/kernel/` (just
  `BotError` — kept deliberately tiny) + `bot/src/games/{container,cantstop}/`, with **subpath exports**
  (`@game-hub/bot/container`, `@game-hub/bot/cantstop`; no `.` default). Container's `botRunner` switched
  `@game-hub/bot` → `@game-hub/bot/container`; its ~94 bot tests moved untouched (pure refactor, like the
  engine reorg). 90% gate per game.
- ✅ **The kernel doesn't assume redaction.** Container's bot decides from a redacted `GameView`; Can't
  Stop's view is the whole state (nothing hidden). The shared kernel accommodates a game with no secrets
  rather than baking in scoring-card assumptions — the counter-example that kept it honest.
- ✅ **Each game registers its own `createBotDriver`** on its backend module (Container and now Can't Stop).
  The bot-seat coordination state (`game_bots`, the hotseat 🤖 toggles, the lobby "assign to AI") is
  game-agnostic, so Can't Stop's bot lit up those affordances for free. Full CS1 write-up in
  [Can't Stop's roadmap](packages/games/cantstop/ROADMAP.md).

Container's own AI ladder (A3 difficulty tiers, A4 ISMCTS, A5 tuning) lives in
[Container's roadmap](packages/games/container/ROADMAP.md).

---

## Track B — Online multiplayer (independent)

The v1 hotseat engine is already authoritative and serializable, so online is **additive**.

| # | Step | Delivers | Size |
|---|------|----------|------|
| B1 | ✅ Server-authoritative views | Per-player state projection (hidden info enforced **server-side**, never sent to the wrong client) | M–L |
| B2 | ✅ Real-time transport + lobby | WebSocket live stream, join-by-code, auto-reconnect; lobby (create → join & name → start) | L |
| B3 | Accounts & persistence | Auth, spectators *(open-games browser + resumable games done, no accounts)* | M–L |

- ✅ **B1 — Server-authoritative views:** a pure `viewFor(state, viewer): GameView` (now
  `packages/games/container/src/engine/view.ts`) redacts non-viewer secrets; the backend applies it at **every**
  response boundary. Generalized by C0 into `GameModule.viewFor` (Can't Stop's is a no-op — nothing to
  hide). **Never send an unredacted state to a client.**
- ✅ **B2 — Real-time transport:** `GameHub` (`backend/src/hub.ts`) fans state out over WebSockets — one
  game = one room, one socket = one seat, projected per-viewer. **REST stays authoritative; the socket is
  push-only.** Version-guarded, auto-reconnecting client; Vite proxies the WS upgrade.
- ✅ **B2 — lobby, seat identity + turn-locking, open-games browser, resume:** pre-game lobbies
  (coordination state outside the engine), `controlledIds` seat binding (a client views the game *as its
  own seats*, `?viewer=p1,p3`), `GET /lobbies` (waiting-for-players) and `GET /games` (resume, secret-free
  summaries). *Simplification that remains: turn-locking is client-side (not seat-authenticated) — fine
  for trusted-LAN / home use.*
- **B3 — Accounts & persistence:** auth and spectators. The no-accounts open-games browser and resumable
  games already cover the home-server case; accounts are only needed for a public deployment.

---

## Platform features (game-agnostic)

Built in the core, so **every game gets them free** — the real payoff of the C0 seam.

- ✅ **Abandon a game (soft delete):** an **Abandon game** button on the home screen closes out a game
  nobody means to finish. Soft: `games.abandoned_at` is stamped, the row and log survive and stay
  readable, but it's out of play (`409 GAME_ABANDONED`) and its bots stop. **Not scored** — an unfinished
  game has no winner. Needs **no `GameModule` hook**; the ⚠️ gate is a `preHandler` above every route (so
  it also covers modules' own mutating endpoints), and adding the column needed a real `ALTER TABLE`
  migration. See [`docs/design-patterns.md`](docs/design-patterns.md) §5 (Persistence).
- ✅ **Rematch (play again, same players):** a **Rematch** button on the shared `GameOver` screen. One
  player proposes, **another accepts**, and a fresh game of the same type starts with the same seats and
  bot assignments; everyone watching is pushed the new game's id and navigates to it. Coordination state
  outside the engine (a `rematches` table, like lobbies/bots) — **game-agnostic, no `GameModule` hook**.
  Threshold is *two distinct human seats* (a lone human vs bots, or a hotseat client driving everyone,
  starts in one click). The shell owns it end to end and reaches the shared `GameOver` (in any board) via
  a React context, so no game's board threads it. `409 REMATCH_NOT_READY` before the game ends; refused on
  an abandoned game by the same `preHandler`.
- ✅ **In-game chat + presence:** a game-agnostic chat panel in the shell's board chrome. **Chat** is sent
  over REST (`POST /games/:id/chat`) and fanned out as a `chat` socket envelope; it lives in its own
  append-only `chat_messages` table and is **table-public** (every viewer sees every message — nothing to
  redact, per "everything logged is public"). A send must name a real seat; **spectators are read-only**
  (`INVALID_SENDER`, 400). A resuming client is backfilled the recent tail (capped at
  `CHAT_BACKFILL_LIMIT` = 100). **Presence** is derived purely from the socket subscription lifecycle
  (subscribe / unsubscribe / heartbeat-reap) — no polling, no persistence — and pushed as a `presence`
  envelope; the viewer label (seat name(s) / `'Spectator'` / `'Table'`) is computed in the stream route
  and handed to the hub as an opaque string, so `GameHub` stays game-agnostic. **No `GameModule` hook** —
  every game gets it free. Own route module (`routes/chat.ts`), backend + two-context e2e tests, and a
  320px responsive spec. See [`docs/design-patterns.md`](docs/design-patterns.md) §4 (Transport).
  - ⚠️ **Next kernel minor:** `chat`/`presence` ride the kernel's *open* `GameMessage`
    (`{ type: string; … }`) and are narrowed shell-side today; giving them a **typed** place in a
    `GameMessage` union is a `@game-hub/kernel` minor (a release was out of scope for this feature).
- ✅ **Deployment — single-image container:** a multi-stage `Dockerfile` builds the UI + native SQLite and
  runs one Node/Fastify process serving the web app **and** the API on one port; SQLite persists to a
  `/data` volume. `docker-compose.yml` + **[`DEPLOY.md`](./DEPLOY.md)** cover a Portainer/home-NAS deploy.
  No auth (trusted-LAN use). ⚠️ When adding a top-level API route, update the SPA-fallback allowlist regex
  in `app.ts`.

---

## Review backlog — what remains from the 2026-07 architecture review

`REVIEW.md` (the three-games-in deep review) was **retired 2026-07-28**: Tiers 1–4 all shipped, so the
live remainder moved here and the file was deleted. The full text is in git history (last at commit
`cc02293`); code comments citing "REVIEW §x.y" refer to it. Struck as stale on retirement (verified
fixed since the review): the Stone Age bot heuristic cliffs (fixed by SA12a's value-based policy), the
Stone Age card-deck leak (fixed by SA15), "bot strength unmeasured" (`pnpm bench` + the
calibrate-then-commit convention), the hardcoded e2e game list, and "no linter" (ESLint 9 + Prettier in
CI).

**Platform items (independent, any order — none blocks play):**

- ✅ **`app.ts` is the file that grew back** — **done 2026-07-31** (a chat/presence feature is queued
  next, which is the "next time a feature lands there" trigger). Split from 1182 lines into a thin
  composition root (`app.ts`, ~95 lines) plus a shared `services.ts` (repositories + the game-lifecycle
  and error-reply helpers) and one registrar per concern under `backend/src/routes/`
  (`health`, `stream`, `games`, `abandon`, `rematch`, `modules`, `lobbies`, `static`). Pure refactor —
  registration order preserved (abandon guard first, `@fastify/websocket` before the stream route), the
  ⚠️ SPA-fallback allowlist regex moved intact into `routes/static.ts`, all backend tests green.
- ✅ **Backend test hygiene** — **done 2026-07-31.** `app.test.ts` (1238 lines) split by concern into
  `app.test.ts` (core REST), `auctions.test.ts` (Container's auction module routes) and
  `botSeats.test.ts` (the bot-seat platform); added `backend/src/tests/helpers.ts` (the engine
  convention — `newApp`, a generic `wsReader`, and a re-export of the kernel's `mulberry32`); the four
  hand-rolled `mulberry32` copies now import from `@game-hub/kernel`. Three were the *drifted* variant the
  D2c follow-up flagged; the swap to the canonical stream was re-verified green (their seeds still reach
  the intended finishes), so that follow-up is closed for the four `mulberry32` copies. The differently
  named `makeRng` copies in stpetersburg/russianrailroads stay as a separate seed-verified matter. 306
  tests before and after.
- **Engine immutability is asserted only in Container** — **now a per-game-repo concern** (2026-07-31):
  the engines all left this repo when the games went out-of-repo, so an immutability test for a game
  belongs in that game's own repository, beside its engine. Tracked in each game's own ROADMAP; not a
  hub-side item any more. (Stone Age and Saint Petersburg do the most nested-record rebuilding, so
  they're the ones most worth pinning — a note for those repos.)
- **`expectError` typing regressed in the newer games** — **now a per-game-repo concern** (2026-07-31):
  each game's `expectError` helper lives with its engine tests in that game's repository now, so
  compile-checking it against the game's error union is work for that repo. Tracked in each game's own
  ROADMAP; not a hub-side item any more.
- **`MoveRecord.type` is stringly-typed** — **stays in the hub backlog** (it's a **kernel** change):
  `MoveRecord` is a `@game-hub/kernel` primitive, so typing `type` against each game's `ActionType` union
  (and the UI's log filters with it) is a kernel API change that needs a **kernel release** to land —
  every game and both hosts consume the published contract. Not a quiet edit; schedule it with a kernel
  version bump.
- ✅ **WS heartbeat** (deferred from §4.7) — **done 2026-07-31.** `GameHub.startHeartbeat` pings every
  live-stream socket on an interval (`WS_HEARTBEAT_INTERVAL_MS`, 30s) and terminates any that missed the
  previous pong, so a half-open socket (a peer gone without a FIN) is reaped within a sweep or two rather
  than sitting in `rooms` and against its per-IP cap forever. `terminate()` emits a local `close`, which
  runs the stream route's existing cleanup; the interval is `unref`'d and stopped on `onClose`. The
  origin check is untouched. Covered by `backend/src/tests/hub.test.ts` (reap, spare-on-pong, skip a bare
  Sendable, skip a non-open socket, interval + stop). See design-patterns §4.
- ✅ **Dependencies are clean but stale** — **done 2026-07-31**, each its own commit: **vitest 3.2.4 →
  4.1.10** (with `@vitest/coverage-v8`, lockstep across kernel + backend; no config migration — v4's
  AST-aware v8 coverage shifted the measured backend numbers down a little but they stay above the gate),
  **vite 6 → 8.2.0** in ui (with `@vitejs/plugin-react` 4 → 6; no config migration; dev server + build +
  e2e verified), and **better-sqlite3 11 → 13** in backend (`docker build` clean, the container boots
  healthy — `/health`'s real `SELECT 1` exercises the native binding, no ABI mismatch). `pnpm audit`
  still clean.
- ✅ **`reference_materials/` needs a README note** — **done 2026-07-31.** `reference_materials/README.md`
  records that the PDFs are gitignored for copyright and the exact filename each of the six games'
  rulebook belongs under, and points at each game repo's own same-convention note.

**Game-scoped remainders** moved to their game's roadmap: Container's auction-fetch race and
`Action`-marker shape → [`packages/games/container/ROADMAP.md`](packages/games/container/ROADMAP.md);
Stone Age's building-stack redaction (§4.6's second half) →
[`packages/games/stoneage/ROADMAP.md`](packages/games/stoneage/ROADMAP.md).

---

## Pacing & credits

- **One slice per session** is a good default — each ends green and demoable, a clean checkpoint to commit
  and pause.
- **Before starting a slice,** check remaining plan usage so you don't land mid-slice; if tight, pick an
  **M/S** item.
- **Suggested next order (updated 2026-07-31, now that every game is out-of-repo and published):** all six
  games live in their own `whtdrgn101/game-<id>` repos and are consumed here as `@game-hub/game-*@^0.1.0`,
  so per-game work now happens **in the game's own repo** and reaches the hub with a `pnpm labyrinth`-free
  version bump (raise the `^0.1.0` range + `pnpm install`). **RR9b** — the RR board-UI revamp, which was
  queued behind Labyrinth precisely so it could borrow that board's findings (a fluid no-fixed-width grid,
  `ActionTip` on disabled affordances, inline-SVG art that survives a mis-wired host) — then **RR10** (its
  bot). Two small Labyrinth endnotes: **L4b** (its original art) and **L5** (its bot), both tracked in
  [`whtdrgn101/game-labyrinth`](https://github.com/whtdrgn101/game-labyrinth). The hub-side npm-publish
  bookkeeping is **done** (the whole extraction wave landed 2026-07-31). Otherwise open work is independent
  and can go in any order: Container's **A3–A5** (difficulty/search), **Can't Stop CS3** (variants),
  **B3** (accounts), and the review backlog above — none essential for home/LAN play.
