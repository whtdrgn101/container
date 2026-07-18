# Roadmap — the platform

This is the **platform & engine roadmap**: the seams that make the site a *games room* rather than one
game, and the higher-level "which games, and what's left of them" view. Game-specific slices live in
**per-game roadmaps**, one in each game's folder:

| Game | Status | Roadmap |
|------|--------|---------|
| **Container** | core game complete; AI A0–A2 shipped, A3–A5 remain | [`engine/src/games/container/ROADMAP.md`](engine/src/games/container/ROADMAP.md) |
| **Can't Stop** | complete: playable, AI (CS1) + art/a11y polish (CS2) shipped; only optional variants (CS3) remain | [`engine/src/games/cantstop/ROADMAP.md`](engine/src/games/cantstop/ROADMAP.md) |
| **Stone Age** | **core game complete** (SA0–SA11: placement, gather+tools, buildings, civ cards, feeding, round loop, game end + scoring); AI bot + polish remain | [`engine/src/games/stoneage/ROADMAP.md`](engine/src/games/stoneage/ROADMAP.md) |

Adding a game is **additive** — implement the seams, register, done (proven three times now — Container,
Can't Stop, Stone Age). See CLAUDE.md → "Building a new game" for the recipe.

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
[Can't Stop's roadmap](engine/src/games/cantstop/ROADMAP.md); the platform-shaped outcomes:

- **The engine became a per-game platform.** `engine/src/` is now `kernel/` (GameError, MoveRecord,
  Viewer) + `games/{container,cantstop}/`, exported by **subpath** (`@game-hub/engine/<game>`, no `.`
  default — no privileged game). Pure refactor of Container (its 204 tests moved untouched); the package is
  **250 tests at 100% across both games**. See CLAUDE.md → "How the shared engine is consumed" and
  "Building a new game".
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
  [Can't Stop's roadmap](engine/src/games/cantstop/ROADMAP.md).

Container's own AI ladder (A3 difficulty tiers, A4 ISMCTS, A5 tuning) lives in
[Container's roadmap](engine/src/games/container/ROADMAP.md).

---

## Track B — Online multiplayer (independent)

The v1 hotseat engine is already authoritative and serializable, so online is **additive**.

| # | Step | Delivers | Size |
|---|------|----------|------|
| B1 | ✅ Server-authoritative views | Per-player state projection (hidden info enforced **server-side**, never sent to the wrong client) | M–L |
| B2 | ✅ Real-time transport + lobby | WebSocket live stream, join-by-code, auto-reconnect; lobby (create → join & name → start) | L |
| B3 | Accounts & persistence | Auth, spectators *(open-games browser + resumable games done, no accounts)* | M–L |

- ✅ **B1 — Server-authoritative views:** a pure `viewFor(state, viewer): GameView` (now
  `engine/src/games/container/view.ts`) redacts non-viewer secrets; the backend applies it at **every**
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
  migration. See CLAUDE.md → "Abandon a game".
- ✅ **Rematch (play again, same players):** a **Rematch** button on the shared `GameOver` screen. One
  player proposes, **another accepts**, and a fresh game of the same type starts with the same seats and
  bot assignments; everyone watching is pushed the new game's id and navigates to it. Coordination state
  outside the engine (a `rematches` table, like lobbies/bots) — **game-agnostic, no `GameModule` hook**.
  Threshold is *two distinct human seats* (a lone human vs bots, or a hotseat client driving everyone,
  starts in one click). The shell owns it end to end and reaches the shared `GameOver` (in any board) via
  a React context, so no game's board threads it. `409 REMATCH_NOT_READY` before the game ends; refused on
  an abandoned game by the same `preHandler`.
- ✅ **Deployment — single-image container:** a multi-stage `Dockerfile` builds the UI + native SQLite and
  runs one Node/Fastify process serving the web app **and** the API on one port; SQLite persists to a
  `/data` volume. `docker-compose.yml` + **[`DEPLOY.md`](./DEPLOY.md)** cover a Portainer/home-NAS deploy.
  No auth (trusted-LAN use). ⚠️ When adding a top-level API route, update the SPA-fallback allowlist regex
  in `app.ts`.

---

## Pacing & credits

- **One slice per session** is a good default — each ends green and demoable, a clean checkpoint to commit
  and pause.
- **Before starting a slice,** check remaining plan usage so you don't land mid-slice; if tight, pick an
  **M/S** item.
- **Suggested next order:** the bot reorg, **Can't Stop CS1/CS2** (AI + polish) and **C4** (cross-game
  polish) are **done** — Can't Stop is complete bar optional variants, and the platform's Track C is fully
  shipped. Open work is independent and can go in any order: Container's **A3–A5** (difficulty/search),
  **Can't Stop CS3** (variants), and **B3** (accounts) — none essential for home/LAN play.
