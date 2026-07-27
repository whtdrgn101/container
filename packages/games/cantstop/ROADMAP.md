# Roadmap — Can't Stop

The per-game roadmap for **Can't Stop** (the game), tracked across every layer: engine
(`src/engine/`), backend module (`src/module/`), UI client
(`src/client/`), and its bot (`src/bot/`) — all in this package (`@game-hub/game-cantstop`). Platform/engine-wide work lives in the
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
- ✅ **Backend module** (`backend/src/games/cantstop/`): a registered `GameModule` with no pending step and
  no side-channel — proving those hooks are optional (it later gained `createBotDriver` for the AI below).
  **`ROLL` is server-only**: the module's `POST /games/:id/cantstop/roll` route rolls four dice from the
  injected **`ModuleContext.rng`** (the one seam change C3 needed) and applies a pure engine action
  carrying them, so a client asks to roll but can never choose its own dice. `parseAction`/`legalActions`
  refuse client `ROLL`s.
- ✅ **UI client** (`ui/src/games/cantstop/`): a lazy board (eleven columns with runners/squares/claims,
  roll / choose-a-pairing / stop controls gated on `canDrive`) plugged into the same `GameClient` seam the
  landing picker now offers alongside Container. A left-hand **marker tray** (empty black circles = markers
  still free) and a **roll-count** line surface the push-your-luck picture (`rollsThisTurn` is engine state).
- ✅ **Tests:** engine 100%; a backend suite that plays a **full game to a win over REST** (seeded rng) and
  asserts Can't Stop and Container coexist; `e2e/cantstop.spec.ts` picks it from the hub and plays a turn.

## ✅ CS1 — Can't Stop AI (shipped)

Can't Stop now has AI seats — enjoyable solo or below the ideal player count. It first needed a home, so
the platform's **per-game bot reorg** shipped first (mirror of the engine's C3 split: `bot/src/kernel/` +
`bot/src/games/{container,cantstop}/`, subpath exports `@game-hub/bot/<game>`; Container's ~94 bot tests
moved untouched). That reorg is logged in the top-level roadmap. Then the Can't Stop bot itself:

- **`decide(view, playerId)`** returns `SELECT` (the best legal pairing) or, in the rolling phase,
  roll-again vs `STOP`. It decides from a `CantStopView`, which is the whole state (nothing redacted) —
  the shared bot kernel doesn't assume redaction, which was the point of keeping it tiny.
- **⚠️ The bot cannot roll itself — rolling is server-only.** So rolling is injected: `decide` returns a
  `ROLL` action whose dice come from an `options.rollDice` callback (the same `collectBids`-style contract
  Container uses), and it throws a `BotError` without one. Self-play seeds that callback from a PRNG; the
  backend `CantStopBotRunner` fills it from `ctx.rng` (via the shared `rollFourDice` the `/roll` route
  uses), so a bot rolls exactly as a person does. `BotDriver.tick` plays bot seats forward until a human is
  on the clock — much simpler than Container's (no auction).
- **The strategy is a pure risk model:** `bustProbability` (exact, over all 6⁴ rolls via the engine's own
  `legalSelections`), an EV-based `shouldRoll` (push while `(1−p)·EXPECTED_ADVANCE > p·steps-at-risk`; take
  the win when a third column is in reach), and a claim-seeking `pickPairing`. All weights are tunable — a
  good later target for a probability-optimal policy.
- **Self-play** drives 2/3/4-player games to completion (deterministic per seed) — the real test that every
  decision is legal. **90% coverage gate**, like Container's bot; the package is **115 tests**.
- **Wired end-to-end:** the module registers `createBotDriver`; the hotseat 🤖 toggles and lobby "assign
  seat to AI" light up for free, with bot seats excluded from `canDrive`/resume. Backend tests: an all-bot
  game plays itself to a finish server-side, and a bot takes its turn and hands back to a waiting human. A
  UI e2e confirms a Can't Stop game with an AI seat plays the bot's turn automatically.

## ✅ CS2 — Visual & a11y polish (shipped)

The board now matches Container's Slice 8 bar with **original** art (no reproduction of any published
game's board):

- **Mountain silhouette:** the eleven columns are bottom-aligned so the taller middle columns form a
  pyramid (7 the peak), the number labels tracing the ridge — Can't Stop's climb, drawn from nothing but
  the column heights.
- **Original pip dice** (`games/cantstop/art/Die.tsx`): the four dice render as theme-aware SVG pip faces
  instead of plain numbers.
- **Faithful pieces:** banked progress is player-coloured **squares** (`rounded-[2px]`), visually distinct
  from the round temporary runners — the rulebook's own "colored squares".
- **Motion** (reduced-motion-aware, via the shared `.reveal-in` keyframe, gated on
  `prefers-reduced-motion: no-preference`): runners fade in as they advance; the dice row and the winner
  banner reveal on entrance.
- **A11y:** each column is a `role="img"` with a summarizing `aria-label` ("Column 7, runner at 4 of 13" /
  "…won by Ann"); the track is a labelled region; dice carry their value as a label. *(Deviation from the
  sketch: Can't Stop cells aren't clickable — you act via the Roll/Select/Stop buttons — so making them
  focusable would be an a11y anti-pattern. Labelled `role="img"` columns replace "focusable cells".)*
- **Responsive e2e** (`e2e/cantstop.spec.ts`): no horizontal document overflow at 320px — the column track
  scrolls within its own container, not the page. *(A pixel visual-snapshot was skipped: Playwright
  baselines are per-OS `-darwin` and would just fail on Linux CI, as Container's already does; the
  robust overflow assertion covers the responsive requirement.)*

## ✅ CS4 — AI difficulty tiers (shipped)

The complaint was a one-note bot ("busts a lot, or wins by two rounds"). The fix scales on **probability
levels** rather than swapping the model — three parameter sets (`DifficultyParams`) over the *same*
exact-`bustProbability` EV machinery, selected by `decide`'s `options.difficulty` (default `'normal'`):

- **normal** — the frozen pre-CS4 policy, **byte-identical**. Every no-tier call defaults to it, so
  self-play and the strength baselines never shifted (a hard rule: don't retune normal to flatter hard).
- **easy** — risk-shy: a `stopThreshold` (~0.28) banks the moment bust probability crosses it even when
  EV says roll on, plus a lower `expectedAdvance`. It visibly banks early — the human-beatable "feel".
- **hard** — the full EV rule **plus endgame urgency**: an `urgencyBoost` scales both the roll-on
  incentive and the claim bonus once any seat is one claim from winning (and harder still when that seat
  is within two steps of a third column), read from public state. Sweeps showed stop-calibration alone
  can't beat normal (1.75 is near-optimal) — the racing *direction* is the only real lever.

**Harness-proven ordering** — the calibrate-then-commit convention's first real use.
`difficulty.bench.test.ts` runs the seat-rotated strength bench: a fast in-suite directional bound
(normal > easy, hard > normal at a fixed, deterministic 40-game count) plus an env-gated
`CANTSTOP_BENCH_GAMES` significance run. At 1200 games **normal beats easy 59.0%** (CI [0.562, 0.618])
and **hard beats normal 53.0%** (CI [0.502, 0.558], lower bound clear of 50%). The hard edge is small
but real and reproducible; a bigger urgency boost plateaus (direction matters, magnitude doesn't).

**Difficulty is coordination state**, the `bots.ts` pattern: a `game_bots.difficulty` column (default
`'normal'`, migrated in like `game_type`), the wire `bots` payload still `string[]`. The module
*declares* its tiers (`GameModule.botDifficulties = ['easy','normal','hard']` — only Can't Stop does),
exposed on `GET /games/catalog`, validated at `POST /games` and lobby join (`400 INVALID_DIFFICULTY` on
a bad tier, a tier on a human seat, or any tier for a game that declares none), carried across rematch,
and read back by `createBotDriver`. The UI shows a per-seat picker (hotseat) / add-bot picker (lobby)
**only** where tiers exist. Other games are entirely untouched.

## Remaining to finish

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
