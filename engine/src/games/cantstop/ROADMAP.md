# Roadmap — Can't Stop

The per-game roadmap for **Can't Stop** (the game), tracked across every layer: engine
(`engine/src/games/cantstop/`), backend module (`backend/src/games/cantstop/`), UI client
(`ui/src/games/cantstop/`), and — once built — its bot. Platform/engine-wide work lives in the
top-level [`ROADMAP.md`](../../../../ROADMAP.md).

Rulebook: `reference_materials/CantStopRules.pdf`. It is the second game on the platform, and the honest
test that the `GameModule` / `GameClient` seams generalize (roadmap **C3**). **The engine coverage gate is
100%.**

## The game, in one paragraph

A push-your-luck dice game for 2–4. On your turn you **roll four dice**, split them into two pairs, and
advance up to **three temporary runners** up the number columns (2–12; the middle columns are tallest
because 7 is the likeliest sum). You may keep rolling to push further, but if a roll can advance nothing
you **bust** and lose the turn's progress; **stop** to bank your runners as permanent squares. Claim the
top of a column to win it; **first to claim three columns wins.** No hidden information — everything is on
the board.

## What shipped — the C3 vertical slice ✅

Can't Stop is **playable end-to-end** (hotseat and online) beside Container on one server. It was built to
stretch the platform in two directions Container never did: **no hidden information** (so `viewFor` is a
no-op — a useful contrast) and **per-turn randomness** (the dice).

- ✅ **Engine** (`engine/src/games/cantstop/`, 100% coverage): the full rules — pairings, the "if you can
  advance both, you must" rule, the three-runner cap, doubles, busting, banking, column claims (bumping an
  opponent's square off), and the three-column win. **Pure and deterministic** — the dice arrive as *data*
  on a `ROLL` action, never rolled inside the engine.
- ✅ **Backend module** (`backend/src/games/cantstop/`): a registered `GameModule` with no bots, no pending
  step, no side-channel — proving those hooks are optional. **`ROLL` is server-only**: the module's
  `POST /games/:id/cantstop/roll` route rolls four dice from the injected **`ModuleContext.rng`** (the one
  seam change C3 needed) and applies a pure engine action carrying them, so a client asks to roll but can
  never choose its own dice. `parseAction`/`legalActions` refuse client `ROLL`s.
- ✅ **UI client** (`ui/src/games/cantstop/`): a lazy board (eleven columns with runners/squares/claims,
  roll / choose-a-pairing / stop controls gated on `canDrive`) plugged into the same `GameClient` seam the
  landing picker now offers alongside Container.
- ✅ **Tests:** engine 100%; a backend suite that plays a **full game to a win over REST** (seeded rng) and
  asserts Can't Stop and Container coexist; `e2e/cantstop.spec.ts` picks it from the hub and plays a turn.

## Remaining to finish

Ordered by value. **CS1 (a bot) is the headline** — Can't Stop is otherwise complete, and a bot makes it
enjoyable solo or with fewer than the ideal player count.

### CS1 — Can't Stop AI  · **M** · depends on the platform bot reorg

A Can't Stop bot is far simpler than Container's — it's a **pure risk model with no hidden information to
reason about** — but it needs a home. The `@container/bot` package is Container-shaped today, so the first
step is the platform's **per-game bot reorganization** (mirror the engine's C3 split: `bot/src/kernel/` +
`bot/src/games/{container,cantstop}/`, subpath exports). That item lives in the top-level roadmap; CS1
depends on it.

Once there's a `bot/src/games/cantstop/`:

- **`decide(view, playerId)` returns an intent** — `SELECT` (which legal pairing) or, in the rolling
  phase, roll-again vs `STOP`. It decides from a `CantStopView`, which is the whole state (nothing is
  redacted), so no `viewFor` cleverness is needed — a pleasant contrast to Container that the reorg's
  shared kernel should accommodate without assuming redaction.
- **⚠️ The bot cannot roll itself — rolling is server-only.** So the intent is *"roll"*, and the backend
  driver executes it by rolling from `ctx.rng` (the same route logic) and applying the `ROLL` action. The
  Can't Stop `BotDriver.tick` loop: on the bot's turn, if `selecting` → apply the chosen `SELECT`; if
  `rolling` → either roll (server generates dice, engine busts or opens a choice) or `STOP`. Wire it via
  the module's `createBotDriver` (omitted today) + a `game_bots`-backed runner, reusing the existing
  bot-seat coordination state — a bot must not do what a player couldn't.
- **The strategy is the stop/continue decision.** The core heuristic: keep rolling while the expected gain
  outweighs the **bust probability** given which columns your runners occupy (a runner on 7 is safe to
  push; runners on 2/12 bust often), how close each is to its top, and how many columns you've already
  claimed. Pairing choice favors progress on tall/likely columns and finishing a near-complete column.
  Cheap to compute exactly (11 columns, 3 runners), and a good later target for measuring against a
  probability-optimal policy.
- **Self-play** drives whole games with every seat botted (as Container's does), which is the real test
  that every decision is legal. **Coverage gate 90%**, like Container's bot.
- **UI:** the hotseat 🤖 toggles and lobby "assign seat to AI" already exist platform-side; once the module
  registers a bot driver, Can't Stop gets them for free. Keep bot seats out of `canDrive`/resume.

### CS2 — Visual & a11y polish  · **S–M**

The board is functional, not fancy (deliberately, to keep the C3 slice "simple"). To match Container's
Slice 8 bar: **original** dice/runner/column art (no reproduction of any published game's board), motion
on runner placement and column claims (reduced-motion-aware), focusable board cells with aria-labels, and
a Can't Stop `e2e/` visual + responsive spec (no horizontal overflow at 320px — the eleven-column track
already scrolls within its own container rather than the page).

### CS3 — Variants (optional)  · **S**

The rulebook's Sackson variants, behind a lobby/setup option (default off): **win at 4 or 5 columns**
(longer 2–3 player games), and the two mutually-exclusive "landing on an opponent's square" rules (skip
the space / forced re-roll). Each is a small, well-contained engine change with its own tests — good
practice at making a rule configurable without branching the whole engine.

## Notes / scope

- **No setup randomness:** unlike Container, `createGame` needs no `rng` — the only randomness is the
  per-turn roll, injected at action time. Keep it that way.
- **Everything is public**, so there is nothing to redact and no secret to leak — the one genuinely
  different property from Container, and worth preserving as the reorg's counter-example.
