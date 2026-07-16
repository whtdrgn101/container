# Roadmap — Container

How we get from the current vertical slice to a complete, faithful game, then to AI and online play.

## Principles

- **Every slice is vertical:** engine → API → UI → tests. Each ends **green and demoable** — a safe
  place to stop, commit, and check your usage before starting the next.
- **The engine coverage gate stays at 100%** the whole way. Tests ship with the code.
- **Read the rulebook per mechanic** (`reference_material/Container_Rulebook_v8.pdf`); page refs below.
- **Sizes** are rough guidance for pacing/credits — **S** ≈ small, **M** ≈ medium, **L** ≈ large.
  Any **L** can be split in half at the noted seam if you want a shorter session.

## Status

- ✅ **Phase 0 — Foundation:** monorepo, tooling, test gates.
- ✅ **Slice 0 — Produce (architecture proof):** Produce wired engine→API→UI, tests at every layer.
- ✅ **Slice 1 — Turn spine + Build:** `Action` union + `applyAction`/`endTurn`/`legalActions`, 2
  actions/turn with active-player enforcement, Build factory/warehouse (costs, limits, distinct
  colors, building supply). Canonical `POST /games/:id/actions` endpoint. Engine at 100% (46 tests).
- ✅ **Slice 2 — Pricing & Reprice:** `factoryStore`/`harborStore` are now priced lots
  (`StoredContainer[]`); factory lots $1–$6, harbor lots $2–$7. Produce places into chosen lots;
  new `reprice` action rearranges a district. Engine at 100% (56 tests). *(UI reprice is
  click-to-cycle for now; a batch drag/reprice UI is deferred to Slice 8 polish.)*
- ✅ **Refactor R1 — Engine modularization:** split the monolithic `game.ts`/`game.test.ts` into a
  folder structure (`core/`, `internal/`, `actions/` with barrels + `createGame.ts`) and per-piece
  test files with shared `tests/helpers.ts`. SOLID/DRY, small single-responsibility files. Public
  `@container/engine` API unchanged; 56 tests still at 100%. See CLAUDE.md → "Engine module layout".
- ✅ **Slice 3 — Ships & sailing:** each player has a ship (`ShipLocation` = ocean / opponent harbor
  / island / bank, cargo up to `SHIP_CAPACITY` 5). `sail` action moves one hop (ocean ↔ destination,
  never own harbor, no destination→destination); `legalActions` enumerates sail targets. Engine at
  100% (68 tests). *(Anchor effects — Harbor Purchase, delivery auction, bank load — attach in
  Slices 4–6; this slice is pure movement, and ship cargo stays empty until Slice 4 loading.)*
- ✅ **Slice 4 — Trade chain:** `factoryPurchase` (buy an opponent's factory containers into your
  harbor by truck, pay the owner, respect harbor limit) and `harborPurchase` (ship docked at an
  opponent → buy their harbor containers onto your ship, up to `SHIP_CAPACITY`). Produce → sell →
  resell → load now works end-to-end. Engine at 100% (93 tests). *(Pricing-during-purchase is folded
  into the separate Reprice action; the free anchor-purchase-on-arrival optimization is deferred to
  Slice 8 polish.)*
- ✅ **Slice 5 — Delivery auctions:** container supply tracked (`supply.containers`, drawn down by
  Produce; shown in the UI as the end-game clock). Sailing a loaded ship to Container Island forces a
  delivery auction (`mustDeliver` gate + `deliver` action): opponents bid, highest wins the cargo into
  their `scoringArea`, and the deliverer collects the bid **plus a matching government subsidy**
  (double); the turn ends. **Buyout** (deliverer keeps the cargo, pays the winning bid — to the supply
  for now, → the Bank in Slice 6, no subsidy) and **runoff auctions** for ties are in; `$0` bids
  (bluffs) work by construction. Engine at 100% (113 tests). *(The physical $0 bluff-card hand is
  cosmetic and out of scope. A still-tied runoff fell to the earliest seat here; **A1b** replaced that
  with the rulebook's "the deliverer chooses".)*
- ✅ **Scoring cards (Slice 7 groundwork):** `ScoringCard` type + a 5-card deck (`SCORING_CARDS`; sc1 =
  rulebook example, structure faithful — *exact color→slot layout to verify vs. components*).
  `createGame` deals one per player; the backend shuffles the deal. The UI reveals the **active**
  player's card (two-value color marked ★) and hides opponents' (hotseat secrecy). Final *scoring* by
  the card is still Slice 7.
- ✅ **Slice 6 — Off-Shore Bank & loans (complete):**
  - **Loans:** `requestLoan`/`repayLoan` (free, $10, max 2); **start-of-turn interest** auto-settled
    on turn advance (via `advanceTurn`, shared by `endTurn` + `deliver`) — pay → forced loan →
    **default** seizing containers (scoring → ship → harbor → factory).
  - **Bank board + pot:** cash lots I/II/III + container lots + tokens. **Loan interest, default
    seizures, and delivery buyouts now flow into the Bank** (pay-the-bank I→II→III distribution).
  - **Container-lot auctions:** `callBank` (bid cash; start/outbid), **win at the start of your turn**
    (`resolveBankWins`) → containers to your **holding area** → `loadHolding` (sail to the Bank, load
    onto your ship) → deliver. Engine at 100% (156 tests).
  - **Cash-lot auctions (6c):** `callBank` on a cash lot bids **containers** (removed from your board)
    to win the lot's cash; win at turn start → reserved containers feed the Bank container lots, cash
    to hand. One auction per type at a time (`AUCTION_TYPE_LIMIT`). Engine at 100% (173 tests).
    *(Simplified: the physical bid-tile / reserve-token storage bookkeeping and the once-per-turn Call
    Bank limit — reserved containers leave the board immediately rather than counting via tokens.)*
- ✅ **Slice 7 — Game end & final scoring:** the game ends when the supply runs out of **2 colors**
  (checked at turn-advance, after the active player finishes); open Bank auctions are awarded, then
  `finalScoring` scores each player — discard your most-common color (two-value rule for ties), score
  the scoring area by your card (two-value $10 if you collected every color else $5), leftover values
  ($3 ship+holding / $2 harbor / $0 factory), minus $11 per loan — and the winner is decided (total,
  factory tiebreak, shared). `applyAction` rejects once `status === 'ended'`; the UI shows a results
  table + winner(s). Engine at 100% (169 tests). *(The end trigger is verified by an engine
  full-flow test; it isn't Playwright-tested because exhausting the supply through the UI isn't
  practical to click.)*
- 🎉 **The core game is complete and finishable in hotseat.**
- ✅ **Slice 8 — UI/UX polish & board:** original SVG container/ship glyphs replace every
  colored-square chip; a `BoardMap` panel shows all ships on an ocean/island/bank/harbor board with
  click-to-sail; motion + a11y pass (reduced-motion-aware); visual-regression baselines per viewport.
  34 e2e green (desktop + mobile).
- ✅ **UX — activity feed + home link:** a running "Activity" log at the bottom of the board narrates
  every move in plain English (newest first, 🤖 for AI seats), so you can see what the other players
  actually did. Safe to render straight from `GameState.log`: the engine only ever records public
  information — losing delivery bids are never written down, which engine tests now pin by asserting
  the `DELIVER` payload exactly. The header title doubles as a link back to the lobby.
- ✅ **UX — abandon a game (soft delete):** an **Abandon game** button on the home screen's
  "Games in progress" card (two-step confirm) closes out a game nobody intends to finish. Soft:
  `games.abandoned_at` is stamped, the row and move log survive, the game stays readable but is out of
  play (409 `GAME_ABANDONED`) and its bots stop. **Not scored** — an unfinished game has no winner.
  Built entirely in the game-agnostic core, which is the first real proof the C0 seam pays: a platform
  feature that needs no `GameModule` hook and works for every future game. See CLAUDE.md → "Abandon a
  game" for the `preHandler` gate and the migration rule.
- ⏭️ **Optional next:** Track A (AI) · Track B (online).

> **Convention going forward:** new engine mechanics are added as `actions/<name>.ts` + a matching
> `tests/<name>.test.ts`, reusing `internal/` helpers. Keep files small and single-responsibility.

---

## Core game — vertical slices (all complete ✅)

| # | Slice | Delivers (demo) | Size | Depends on |
|---|-------|-----------------|------|------------|
| 1 | ✅ Turn spine + Build | Players alternate turns; build factories/warehouses; Produce is now a real "action" | M | Slice 0 |
| 2 | ✅ Pricing & Reprice | Containers live in price lots ($1..$N); set/rearrange prices | M | 1 |
| 3 | ✅ Ships & sailing | Ship tokens move ocean ↔ harbors ↔ islands; legal movement | M | 1 |
| 4 | ✅ Trade chain | Full produce → sell to harbor → load onto ship between players | M–L | 2, 3 |
| 5 | ✅ Delivery auctions | Deliver to Container Island; secret bids, subsidy, buyout, runoff ties, scoring areas | L | 4 |
| 6 | ✅ Off-Shore Bank & loans | Loans + interest + default; Bank board + container-lot & cash-lot auctions | L | 3 |
| 7 | ✅ Game end & final scoring | Play a full game to a declared winner | M | 5, 6 |
| 8 | ✅ UI/UX polish & board | Original SVG art, board minimap w/ click-to-sail, motion + a11y, visual-regression baselines | M–L | 7 |

### Slice 1 — Turn spine + Build  · **M** · rulebook pg. 6, 8
The "game loop." Turns the current free-for-all Produce into a real turn-based game.
- **Engine:** turn model (active player, **2 actions/turn**, free actions, once-per-turn actions,
  advance turn); enforce that only the active player acts; **Build** action (factory / warehouse,
  cost from the next track space, distinct factory colors, storage-limit increases); a first
  **legal-actions** enumerator (what can the active player do right now?).
- **API:** `POST /games/:id/actions` (or per-action endpoints) + `POST /games/:id/end-turn`.
- **UI:** "current turn" + action counter; Build controls; disable illegal actions.
- **Tests:** turn/action limits, build costs & limits, turn advance, wrong-player rejection.
- **Seam (to split):** ship Build first, turn/action enforcement second.

### Slice 2 — Pricing & Reprice  · **M** · rulebook pg. 5, 8, 10
- **Engine:** model both districts as **price lots** rather than a flat list; Produce/Purchase place
  into chosen lots; **Reprice** action (rearrange one district); storage-limit accounting across lots.
- **UI:** choose lots when producing; reprice UI.
- **Tests:** limit math across lots, reprice legality (only own containers, one district).
- Note: this refactors `factoryStore: Color[]` → lot structure. Migrate Slice 0's shape here.

### Slice 3 — Ships & sailing  · **M** · rulebook pg. 5, 11
- **Engine:** ship location (`ocean | harbor:<playerId> | island | bank`), **capacity 5**, **Sail**
  action (2-step: to ocean, then to destination), **anchor** hooks (free action on arrival),
  legality (**never your own harbor**).
- **UI:** board with ship tokens; sail controls.
- **Tests:** movement legality, capacity, anchor triggers.

### Slice 4 — Trade chain  · **M–L** · rulebook pg. 9
- **Engine:** **Factory Purchase** (opponent factory → your harbor, pay the owner, 1 opponent/action,
  respect harbor limit) and **Harbor Purchase** (docked at opponent → your ship, pay the owner).
- **UI:** buy flows; wallet/limit feedback.
- **Tests:** payment transfers, limits, "can't buy your own," docked-requirement.
- **Seam:** Factory Purchase first, Harbor Purchase second.

### Slice 5 — Delivery auctions  · **L** · rulebook pg. 13, 15–16
- **Engine:** sail to Container Island → **delivery auction**: opponents' **secret bids** (+ $0 bluff
  cards), highest wins, deliverer earns **bid + matching government subsidy**, containers → winner's
  **scoring area**; **buyout** (pay bank, keep them); **runoff** on ties; turn ends immediately.
  Deal **hidden scoring cards** at game start (secret per player).
- **UI:** auction modal; hotseat secret-bid entry (hand device / masked input); scoring areas.
- **Tests:** subsidy math, buyout, tie→runoff→still-tied resolution, bluff handling.
- **Seam:** core auction + subsidy first; buyout/runoff/bluff second.

### Slice 6 — Off-Shore Bank & loans  · **L** · rulebook pg. 12–14, 16–17
- **Engine:** **loans** ($10, max 2, $1 interest/turn, repay $10, **default** seizure order);
  **bank auctions** — cash-for-containers & containers-for-cash lots, **bid tiles**, **reserve
  tokens** (count toward storage while bidding), **auction limits by player count**, **win at the
  start of your next turn**, **holding area**, and **pay-the-bank** lot distribution (I→II→III,
  skip tokened lots).
- **UI:** bank board, loan controls, bank-auction flow.
- **Tests:** interest/default, distribution rules, per-count auction limits, reserve-token accounting.
- **Seam:** loans/interest/default first; bank auctions second. *(Independent of Slice 5 — could be
  built before it.)*

### Slice 7 — Game end & final scoring  · **M** · rulebook pg. 17–19
- **Engine:** **end trigger** (supply of any **2 colors** exhausted → active player finishes turn);
  resolve any active bank auctions; **final scoring** — discard your most-common island color,
  score the rest by your card, **two-value container** ($10 if you hold ≥1 of every color incl. the
  discarded one, else $5), leftover values ($3 ship/holding, $2 harbor, $0 factory), **repay loans
  −$11 each**; winner + tiebreaks.
- **UI:** end screen with per-player score breakdown.
- **Tests:** end detection, each scoring step, two-value edge cases, tiebreakers. **A full-game
  integration test** (scripted moves → expected winner).

### Slice 8 — UI/UX polish & full board  · **M–L**
- ✅ **8a — Original SVG art kit:** hand-authored, CSP-safe, theme-aware SVG glyphs (`ContainerSvg`,
  `ShipSvg`) — *original* corrugated-container and cargo-ship designs, not reproductions of any
  published game's artwork. All colored-square chips (store, cargo, scoring, holding, supply, bank
  lots, factories) now render `ContainerSvg` via the `ContainerChip` wrapper (kept as `span[title]`
  so e2e counts hold).
- ✅ **8b — Board minimap:** `BoardMap` panel above the player cards — an ocean with Container Island,
  the Off-Shore Bank, and one dock per player. Every ship is drawn at its location (per-seat hull
  tint, active ship pulsing, cargo count); clicking a legal destination sails the active player.
  Responsive (`aspect-[5/2]`, `overflow-hidden`) and theme-aware. Covered by `e2e/board-map.spec.ts`.
- ✅ **8c — Motion & a11y:** ships glide between locations (`transition-[left,top]`) and the active
  ship pulses; the auction and results panels fade/slide in (`.reveal-in`). All motion is gated on
  `motion-safe` / `prefers-reduced-motion`. Board nodes are focusable `<button>`s with `aria-label`
  and a visible focus ring; the board has `role="img"` + a descriptive label. Board is taller on
  narrow screens (`aspect-[3/2] sm:aspect-[5/2]`).
- ✅ **8d — Visual regression:** `e2e/visual.spec.ts` captures a `toHaveScreenshot` baseline of the
  board minimap per viewport (desktop + mobile). Baselines live in
  `ui/e2e/visual.spec.ts-snapshots/` and are committed. Only the board is snapshotted because it's
  deterministic at game start; player cards depend on the randomized deal. *Note: Playwright suffixes
  baselines per-OS (`-darwin`); regenerate with `--update-snapshots` if running e2e on another OS/CI.*

**After Slice 7 the game is fully playable hotseat.** Slice 8 and both tracks below are independent.

---

## Track A — AI play (after the core game is playable, Slices 1–7)

Container has hidden information (secret scoring cards, sealed auction bids) and bluffing, so AI is a
real project. The engine's **purity + serializability** is the key enabler: bots can *simulate* freely.

| # | Step | Delivers | Size |
|---|------|----------|------|
| A0 | ✅ `@container/bot` + greedy bot + self-play | `decide(view, playerId) → Action`, `bidFor(...)`; headless self-play driver proves the brain with no server | M–L |
| A1a | ✅ Delivery auction as coordination state | Pending auction outside the engine; each opponent bids from **their own device**, then the deliverer accepts or buys out. Unblocks bot deliveries **and** closes the secret-bid leak | L |
| A1b | ✅ Runoff + deliverer's tie choice | Tie → runoff round (tied players add cash); still tied → the deliverer **chooses** the winner (pg. 16), replacing the engine's earliest-seat simplification | M |
| A2 | ✅ Bot seats end-to-end | Backend `BotRunner`; hotseat **"add AI player"**; lobby **"assign seat to AI"** | M–L |
| A3 | Difficulty tiers + auction modeling | Easy/Normal/Hard; opponent-card estimation; basic bluff/counter-bluff | L |
| A4 | Search-based bot (ISMCTS) | Information-Set Monte-Carlo Tree Search with determinization over hidden info, using engine sim | L |
| A5 | Self-play tuning | Calibrate difficulty & heuristics from batch self-play results | M |

**Decisions taken at Track A kickoff:**

- **Bots run server-side.** A backend `BotRunner` watches games and applies actions for bot seats, so
  hotseat and remote play use *one* implementation and a game keeps moving even with no browser open.
  The UI stays a dumb observer — it never drives a bot.
- **Bots live in a new `@container/bot` package**, a sibling of `engine` that depends on it and exports
  TS source the same way (`exports: "./src/index.ts"`). It gets its **own ~90% coverage gate** so
  heuristic tuning doesn't fight the engine's 100% bar. The split is deliberate: **engine = rules,
  bot = opinions.** No bot code enters `engine/`.
- **Bots decide from a `GameView`, not a `GameState`** — `decide(viewFor(state, botId), botId)`. Feeding
  the bot the redacted view makes cheating *structurally impossible* rather than a matter of discipline.
  (`legalActions` never reads scoring cards, so the bot casts its view for move enumeration exactly as
  the UI already does.)
- **Bot-ness is not engine state.** Which seats are bots is coordination state, like lobbies — it lives
  in the backend (a `bots` column on `games`, a member `kind` in `lobbies`), never in `GameState`. The
  engine must not learn what a bot is.

- **Prerequisite (A0) — ✅ already delivered by B1:** the per-player view model (`viewFor`) and the
  legal-action generator both exist. A0 is therefore just the bot package itself.

- **⚠️ The blocker A1 exists to solve.** `DELIVER` is a **single atomic action carrying every
  opponent's bid** (`{ type:'DELIVER', bids: Record<playerId, number> }`); the engine has no pending-
  auction state, and today the human deliverer types *all* the secret bids on their own screen. That
  breaks in both directions once a seat is a bot:
  - **Human delivers, bot bids** — solvable inside A2: the backend merges bot bids into the `DELIVER`
    before `applyAction`, so the bot's bid never passes through the deliverer's client.
  - **Bot delivers, humans bid** — *not* solvable that way. The bot cannot invent human bids, and no
    client owns the prompt. This needs a **pending delivery auction**: the backend records "delivery
    open", each human client bids from its own device, and once every bid is in the backend fills the
    bot seats and submits one `DELIVER`. That's coordination state *outside* the engine — precisely
    the shape `lobbies.ts` already established, so it's a pattern we have, not a new one.

  A1 is sequenced **before** A2 because of this, and it pays for itself independently: routing bids
  per-device is exactly the fix for the "secret bids are entered on the active player's screen"
  caveat still logged against B2. Ship A1 and human-only games get better even if no bot ever runs.

- ✅ **A0 — `@container/bot` (greedy bot + self-play driver).** New workspace package (90% coverage
  gate, 81 tests). Public API: `decide(view, playerId, { collectBids })`, `bidFor(view, bidderId)`,
  `wantsBuyout`, `playSelfPlay(state)`. Structure mirrors the engine's conventions — one policy file
  per concern (`policies/{pricing,economy,trade,voyage,bank,rank}.ts`) plus `valuation.ts`.
  - **Parameter completion is where the strategy lives.** `legalActions` returns five of its twelve
    actions as bare *markers* (PRODUCE, REPRICE, both purchases, CALL_BANK) that `applyAction` throws
    on; `rank()` completes them, and deciding *what price / what bid / what to buy* is the policy.
  - **Valuation delegates to the engine's own `finalScoring`** rather than re-deriving it. This is
    load-bearing, not purity theatre: the discard rule means a container's marginal value is *not*
    its face value and can be **negative** (a second white flips white to your discard, turning a $10
    container into −$4). A bot valuing by `card.values[color]` would systematically overbid.
  - **Auction estimates use public info properly.** Scoring *areas* and cash are public — only cards
    are secret — so `expectedAuctionBid` values cargo against every card an opponent *could* hold
    (excluding the bot's own), averages, and caps by their actual money. A flat per-container average
    was measured ~5× too high.
  - **Self-play is the real test.** It drives thousands of live engine actions per run; any illegal or
    unparameterized action makes `applyAction` throw. It caught the bug below.
  - **⚠️ Tuning found (and fixed) a chain-starvation bug:** scored naively, each *hop* of the delivery
    run (dock → buy → ocean → island) ranks below simply producing again, so ships never sailed — a
    5-player game ran 52 turns with **zero deliveries** while still "completing" on the supply clock.
    Fixed by making a loaded ship outrank routine production. Now 6.8 deliveries/game at 5p. The
    lesson generalizes to A3/A4: *a greedy bot cannot see a multi-action payoff*, so any long chain
    needs its scores tied to the goal, not the hop.
  - **Known, deferred to A5:** `RESALE_PER_CONTAINER = 3` is calibrated from measured self-play, not
    derived. And self-play at **5 players shows a seat bias** — p1 won 5/5 games across varied deals
    (3p/4p spread normally). Worth investigating before trusting difficulty tiers.

- ✅ **A1a — the delivery auction is now real coordination state.** `backend/src/games/container/auctions.ts` holds a
  `DeliveryAuction` (`gameId`, `delivererId`, `cargo`, `phase`, secret `bids`) in a
  `delivery_auctions` table, exactly the shape `lobbies.ts` established. The engine gained nothing but
  an exported `mustDeliver` — it still has no concept of a half-finished auction, and must not.
  - **Lifecycle:** the auction is **derived from game state**, not from a row someone remembered to
    write (`syncAuction` runs on read *and* write). A game already at Container Island when this
    shipped — a live game mid-upgrade — heals instead of wedging with no way to resolve the delivery.
  - **Endpoints:** `GET /games/:id/auction?viewer=<seat>`, `POST /games/:id/auction/bids
    {playerId, bid}`, `POST /games/:id/auction/resolve {playerId, buyout}`. A `DELIVER` posted to
    `/actions` while an auction is due is **rejected** (409 `AUCTION_PENDING`) — otherwise a client
    could bypass the sealed bids entirely, which is the hole this closes.
  - **The leak it fixes:** bids used to be typed on the *deliverer's* screen, so they chose whether to
    buy out already knowing what they'd be paid. Now the server holds every bid and `auctionViewFor`
    reveals nothing until the last opponent commits — over REST *and* the WS push. That "who has bid"
    is public while "what they bid" is not is the whole design.
  - **Hotseat** collects bids sequentially behind a **pass-the-device gate** ("I'm Ann — enter my
    bid"), so one shared screen gets genuinely secret bids. Same endpoints as remote play: one path.
  - **Off-turn loans (pg. 16) landed with it**, because the rule has nowhere else to happen: a broke
    opponent must be able to borrow *in order to bid*. `REQUEST_LOAN` now escapes both the turn check
    and `MUST_DELIVER`; `legalActions(state, playerId)` answers for off-turn seats. Repaying and Bank
    loading stay on-turn ("Unlike other free actions").
  - Covered by engine tests (100%), backend integration tests (incl. redaction over REST and
    WebSocket), and Playwright specs incl. the secrecy property itself.

- ✅ **A1b — the runoff and the deliverer's tie choice. Track A1 is complete.**
  - **The rule (pg. 16):** tied leaders add cash *without* taking their opening bid back, highest
    **total** wins; if they're *still* level, "the player delivering containers **chooses** which tied
    bidder wins". The engine used to hand it to the earliest seat, quietly deciding a real strategic
    choice on the deliverer's behalf. It now throws `CHOICE_REQUIRED` rather than guess.
  - **`deliver` takes a `DeliveryResolution` object** (`{ bids, runoffBids?, buyout?, chosenWinnerId? }`)
    instead of six positional params — it mirrors the `DELIVER` action 1:1. A `chosenWinnerId` offered
    when nothing is tied is **rejected**, so a caller can't quietly hand the cargo to whomever it likes.
  - **A buyout needs no choice:** nobody wins the cargo, so a still-level runoff only sets the price
    ("all tied bidders return their bids").
  - **⚠️ One rule, one copy: `deliveryOutcome(state, delivererId, bids, runoffBids)` is exported.**
    The tie logic was about to exist in *three* places — `deliver`, the backend's auction projection,
    and the bot (which must predict the price to decide whether to buy out). Three copies is three
    chances to drift, so the rule lives in the engine and the other two ask it. If you need to know
    who wins an auction, **call this; don't re-derive it.**
  - **The auction gained a `runoff` phase** (`bidding → runoff → decision`). The same
    `POST .../auction/bids` endpoint serves both rounds — the phase decides where the bid lands — so
    the API stayed the same size. Runoff bids are secret until the round closes, exactly like opening
    bids; opening bids stay *visible* through the runoff, since pg. 16 means you add cash knowing what
    you're level on. A runoff bid is validated against the **total**, as the opening bid isn't returned.
  - **The bot plays it properly:** `runoffBidFor` reaches nearer true value than its opening bid (a
    runoff proves the shading was what lost it), and `chooseTiedWinner` gives the containers to
    whichever tied opponent they help *least* — measured in expectation over the cards that opponent
    could still hold, since areas are public and cards aren't. Two bots valuing cargo alike deadlock,
    which is correct: that's exactly the case the rulebook gives the deliverer.
  - Engine 202 tests (100%), bot 94, backend 79, e2e 52 — incl. specs for the runoff round and for a
    deliverer awarding a level tie to the *later* seat (proving it's a choice, not seat order).
- ✅ **A2 — bot seats end-to-end. The AI is playable.** `BotRunner` (`backend/src/games/container/botRunner.ts`) plays
  every AI seat forward after any change, stopping the moment a human is on the clock.
  - **Bot-ness is coordination state, not engine state.** A `game_bots` table (`bots.ts`) — a separate
    table, not a column, so `CREATE TABLE IF NOT EXISTS` upgrades a live database with no migration.
    It rides *beside* the game (`{ game, bots }`, and `bots` on the WS state message), never inside
    `GameState`; a test asserts the engine state never contains the word.
  - **The runner has no special powers.** It builds actions with the same `@container/bot` policies
    self-play uses, hands them to the same `applyAction` a human's move goes through, and bids through
    the same `applyBid` the REST route uses — which was extracted from the route for exactly this, so
    there is one implementation of what a bid means. It decides from `viewFor(state, botId)`, so it
    cannot see an opponent's card either.
  - **Synchronous by design:** the engine and SQLite both are, so a route ticks and then simply reads
    the game back. A human's `END_TURN` returns with the bots' turns already played.
  - **⚠️ `tick` runs on read as well as write** (`GET /games/:id`, `GET .../auction`, WS subscribe).
    Bot turns are normally driven by whatever mutation preceded them — but *nothing mutates while it's
    already a bot's move*. After a restart the AI would sit there forever and **no human could unstick
    it, because it isn't their turn.** Ticking on read makes that self-healing.
  - **Delivery auctions compose with A1 for free:** the runner fills bot bids, bots take their own
    runoff round, and a bot deliverer resolves its own auction (`wantsBuyout` + `chooseTiedWinner`).
    A bot never resolves a *human's* delivery — the call stays theirs.
  - **UI:** per-seat 🤖 toggles on the hotseat quick-start, **"Add an AI player"** in the lobby, 🤖
    badges on bot player cards, and AI seats excluded from `mySeatIds`/`canDrive` (so a person is never
    asked to take a bot's turn or bid) and from the **resume** list (which would put a second driver on
    the seat *and* show a human the bot's secret card — `GameSummary.bots` closes that).
  - Backend 90 tests (incl. an all-bot game playing itself to a scored finish), e2e 60 (incl. an
    all-AI table finishing through the real UI).
  - **Known:** difficulty is uniform — every bot is the A0 greedy policy (A3 adds tiers). Bots play
    instantly with no "thinking" pause, which reads as abrupt at a shared screen; worth a small delay.

- **Why ISMCTS (A4):** it's the standard fit for hidden-info, auction/trick games; the deterministic
  engine lets it roll out thousands of sampled games cheaply. Note the bot holds a **redacted view**,
  so determinization means sampling the opponents' unseen scoring cards from `SCORING_CARDS` minus its
  own — the bot must reconstruct a plausible `GameState` to simulate, since a `GameView` isn't
  feedable back into the engine.

## Track B — Online multiplayer (independent; can start after Slice 4+)

| # | Step | Delivers | Size |
|---|------|----------|------|
| B1 | ✅ Server-authoritative views | Per-player state projection (hidden info enforced **server-side**, never sent to the wrong client) | M–L |
| B2 | ✅ Real-time transport + lobby | WebSocket live stream, join-by-code, auto-reconnect; **lobby** (create empty seats → join & name → start) | L |
| B3 | Accounts & persistence | Auth, spectators *(open-games browser + resumable games done, no accounts)* | M–L |

The v1 hotseat engine is already authoritative and serializable, so online is **additive** — B1 mostly
formalizes "what each player is allowed to see," which A0 also needs.

- ✅ **B1 — Server-authoritative views:** the engine gains a pure `viewFor(state, viewerId): GameView`
  projection (`engine/src/view.ts`) that redacts every non-viewer player's secret `scoringCard` to
  `null` (all revealed once the game has `ended`, so final scoring is public; `null` viewer = a
  spectator sees none). The DB still stores the full authoritative state; the backend applies
  `viewFor` at **every** response boundary (`POST /games`, `GET /games/:id`, `POST .../actions`),
  defaulting the viewer to the active player for hotseat and honoring `GET ?viewer=<id>` for a
  specific seat/spectator. The UI now consumes `GameView` (nullable card) and reveals a card only
  when present. Covered by engine unit tests (`viewFor`, 100%) + backend integration tests
  (redaction, per-viewer deal, spectator). **B2/B3 build on this** — the transport just picks each
  connected client's `viewerId` instead of defaulting to the active seat.
- ✅ **B2 — Real-time transport:** a `GameHub` (`backend/src/hub.ts`) fans game state out over
  WebSockets — one game = one room, one socket = one seat. `GET /games/:id/stream?viewer=<id>`
  (via `@fastify/websocket`) sends an initial snapshot then a push on every mutation, each projected
  through `viewFor` for that socket's seat (omit `viewer` to follow the active player, for hotseat).
  REST stays authoritative: `POST .../actions` broadcasts the new state after persisting. The UI adds
  **join-by-code** (landing screen) + a shareable code in the header, and subscribes to the stream
  with a version-guarded, auto-reconnecting client (`api.subscribeGame`); Vite proxies the WS upgrade.
  Backend `injectWS` tests + a two-context Playwright live-sync spec.
- ✅ **B2 lobby — create → join & name → start:** a pre-game **lobby** (coordination state outside the
  engine: `lobbies` table + `LobbyRepository`, `backend/src/lobbies.ts`). `POST /lobbies {seats}` makes a
  room of empty seats; `POST /lobbies/:id/join {name}` claims the next seat; `POST /lobbies/:id/start`
  runs `createGame` from the claimed names (all seats must be filled) and links the game. The UI landing
  screen offers **Create a shared game** (pick 3–5 seats) alongside the hotseat quick-start; **join-by-code**
  resolves a lobby *or* a started game; the waiting room polls, shows seats filling live, lets a client
  claim one or more seats by name, and **Start** transitions everyone into the game. A client may claim
  several seats (solo testing). Backend lobby tests + a two-context Playwright `lobby.spec.ts`.
- ✅ **B2 seat identity + turn-locking:** entering a game from the lobby binds the window to the seats you
  claimed (`controlledIds`; lobby seat _i_ → player `p{i+1}`). Each client streams the game **as its own
  seats** (`?viewer=p1,p3`), so it sees only its own secret card(s); an **identity banner** shows "You
  are …" and either "Your turn" or "Waiting for …"; and all action controls are gated on `canDrive` (you
  control the active seat) so off-turn clients can't submit moves. `viewFor` accepts a **seat list**,
  applied on all three response paths (GET, the POST-action reply, and the WS stream), so a client holding
  several seats sees exactly its own cards and never another player's — a bound client never "follows the
  active player" (which once leaked the active seat's card). Hotseat / bare join keep `controlledIds = null`
  (drive every seat), preserving single-device play. Covered by the extended `lobby.spec.ts` + backend
  multi-viewer tests. *Still simplified: turn-locking is client-side (not seat-authenticated). The delivery
  auction's secret bids were the other caveat here — **fixed by A1a**, which moved bid collection
  server-side so each opponent bids from their own device.*
- ✅ **B2 open-games browser (no accounts):** `GET /lobbies` lists open lobbies that still have a free
  seat (`LobbyRepository.listOpen`, newest first). The home screen polls it and shows a **"Games waiting
  for players"** card; you pick a **display name** and click Join to claim a seat and drop straight into
  the waiting room — no code needed. Aimed at a home-server deployment where friends/family just hit the
  site and play. Backend `GET /lobbies` test + a two-context `browse.spec.ts`. *(Accounts/auth remain B3.)*
- ✅ **B2 resume in-progress games (no login):** game state is already persisted server-side, so a player
  who closed their tab can jump back in. `GET /games` (`GameRepository.listActive`) returns secret-free
  summaries (id, turn, player names, whose turn — **no scoring cards**); the home screen polls it and shows
  a **"Games in progress"** card. Picking a seat (`Resume as <name>`) re-enters the game bound to that
  player (`controlledIds=[id]`, `viewer=id`), so you see only your own card and are turn-locked as usual.
  Since seats aren't authenticated (by design — home/family use), anyone may resume any seat. Backend
  `GET /games` summary test + `resume.spec.ts`.
- ✅ **Deployment — single-image container:** a multi-stage `Dockerfile` builds the UI + native SQLite
  and runs one Node/Fastify process that serves the web app **and** the API on one port (`ui/dist` static
  + SPA fallback when `UI_DIST` is set; prod UI uses a same-origin API base). SQLite persists to a
  `/data` volume. `docker-compose.yml` + `.dockerignore` + **[`DEPLOY.md`](./DEPLOY.md)** cover a
  Portainer/home-NAS deploy. Verified: image builds, container serves UI+API, and games survive a restart
  via the volume. No auth (trusted-LAN use).

---

## Track C — Multi-game platform (turn the site into a games room)

Today the whole stack is Container-shaped: `games`/`lobbies` tables assume one ruleset, `POST /games`
takes Container's `NewPlayer[]`, the UI's `App.tsx` renders one board. The goal of Track C is a site
where the family picks a game from a list and plays it, with **Container as the first registered game**
rather than the only one.

The good news: the seams are already in the right places. The engine is a pure `state + action → state`
library with a serializable state, `viewFor` is a generic redaction hook, `GameHub` fans out opaque
state, and lobbies already live outside the engine. Track C mostly *names* those seams as an interface
and makes everything above them generic.

| # | Step | Delivers | Size |
|---|------|----------|------|
| C0 | ✅ `GameModule` interface + registry | One typed contract every game implements; Container re-registered through it. No behaviour change | M |
| C1 | `game_type` routing | The column, the backfill, `moduleFor`, namespaced module routes, a generic `GameHub` | M |
| C2 | UI shell | Game picker, per-game lazy-loaded boards, generic lobby/landing; Container's board becomes one plugin | M–L |
| C3 | Second game | Proves the seams are real — the only honest test of the abstraction | L |
| C4 | Cross-game polish | Per-game rules blurbs, shared results screen, per-game bot registration | M |

### ✅ C0 — the `GameModule` seam (shipped)

`backend/src/games/`: `module.ts` (the contract), `registry.ts` (the lookup), `container/` (Container as
one module — `auctions.ts` and `botRunner.ts` moved here). The backend core (`app.ts`, `repository.ts`)
no longer contains a single Container-specific decision.

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

**The sketch this replaces was written before A1a/A2 and had no slot for the delivery auction** — sealed
bids, own table, own redaction rule, own WS message, own three endpoints, ~a third of `app.ts`. The four
hooks that aren't in the original (`routes`, `pendingStep`, `onStateChanged`, `createBotDriver`) exist to
hold exactly that.

**Decision: we did not invent a generic "sealed multi-seat input" framework.** An abstraction designed
off one example fits one game and no others. Instead a module gets somewhere to put its own weirdness:
`routes` registers endpoints the core knows nothing about, `pendingStep` says "that action belongs to a
flow of mine, refuse it at `/actions`". Container's auction stays Container-shaped — it just lives inside
the Container module. **If C3's second game needs the same thing, that is when the shape is real enough
to extract.** Don't extract it sooner.

**How the hard parts landed:**

- **`GameError` → HTTP** is `module.mapError(error) → { status, code, message } | null`. Each game owns
  its own mapping; `null` means "not mine" and bubbles to a 500. No shared error base was needed.
- **Action validation** went the way the roadmap preferred: the route's body schema is now
  `action: { type: 'object' }` and `parseContainerAction` does **all** of it. ⚠️ The old 13-value enum
  also checked payload *shapes* (`{color, price}` items, numeric bid maps); that work moved into
  `parseAction`, which is no stricter and no looser than schema-plus-old-parser combined. **Fastify no
  longer pre-validates actions — don't assume it does.**
- **Randomness** is injected via `createGame({ rng })`; `Math.random` is passed in from `app.ts` and a
  seeded rng in the tests, which is what makes "same rng ⇒ same deal" assertable.
- **Persistence went further than planned.** The seam test (a stub *counter* game driven through the
  core) failed instantly: `GameRepository` read `state.version` and `state.log` off every game. Hence
  `versionOf`/`movesOf` — the repo now reads no field off a game state at all. That was C1's line item;
  it was 15 lines, so it landed here.
- **⚠️ Exactly one game may be registered until C1.** With no `game_type` column a row is just JSON, so
  "which module owns this?" is unanswerable. `buildApp` throws rather than guess — a boot crash beats
  loading someone's game with the wrong engine.

**Tests:** `registry.test.ts` (the registry + Container's contract) and `module-seam.test.ts`, which
hosts a **non-Container stub game** through the core. That second file is the one that matters: the
Container tests pass just as well if the core is secretly hardcoded to Container, which is the exact
thing C0 undid.

### C1 — what's actually left

Smaller than planned, because C0 absorbed the persistence generalization:

- **The column.** `game_type` on `games`/`lobbies`, `NOT NULL DEFAULT 'container'`; existing rows
  backfill to `'container'` and nothing breaks.
- **`moduleFor(gameId)`** reads it, replacing today's deliberate one-game throw in `app.ts`. This is
  *the* change that lets a second game exist — everything above it is already generic.
- **Namespace module routes.** Two games both claiming `/games/:id/auction` is a Fastify duplicate-route
  crash at boot (loud, at least). Namespace by `game_type` once it exists.
- **`GameHub` still imports the engine's `viewFor`** and computes the active player itself; it should
  project through the module instead. It's the last engine import in the core outside `games/container/`.
- **Generic typing vs. the UI's free shared types.** Unchanged and still true: the UI gets
  `GameState`/`Color` free by aliasing the engine source, and a generic shell erases that. The fix is a
  typed per-game client module on the UI side — **don't let `unknown` leak into board components.**

**Sequencing note (resolved):** C0/C1 touch `app.ts`, `repository.ts`, and `lobbies.ts` — the *same*
files Track A needed for the `BotRunner` and the pending auction, so Track A went first. With A0–A2
shipped, C1 is unblocked. A3–A5 are almost entirely inside `bot/`, so they no longer conflict.

---

## Pacing & credits

- **One slice per session** is a good default. Each ends with green tests and a working demo, so it's
  a clean checkpoint to commit and pause.
- The **L** slices (5, 6, A1, A3, A4, B2, C1, C3) each have a noted seam — split them if you want a
  shorter run.
- **Before starting a slice,** check your remaining plan usage so you don't land mid-slice. If usage
  looks tight, pick an **M/S** item (e.g. Slice 7 is smaller than 5/6; A0/A5 are lighter than A1/A4).
- Suggested order: **1 → 2 → 3 → 4 → (5 and 6 in either order) → 7 → 8** ✅, then **Track A (A0 → A1 →
  A2)**, then Track C. Track A before Track C is deliberate: they touch the same backend files, and a
  working bot is a better forcing function for the `GameModule` seam than an imagined second game.
