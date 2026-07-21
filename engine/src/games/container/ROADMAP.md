# Roadmap — Container

The per-game roadmap for **Container** (the game). It tracks Container across every layer it touches —
engine (`engine/src/games/container/`), backend module (`backend/src/games/container/`), UI client
(`ui/src/games/container/`), and its bot (`bot/`). Platform/engine-wide work (the `GameModule` /
`GameClient` seams, online multiplayer, the per-game bot reorg) lives in the top-level
[`ROADMAP.md`](../../../../ROADMAP.md); this file is only the Container-specific slices and its AI.

Rulebook: `reference_materials/Container_Rulebook_v8.pdf`. **Read the relevant page before implementing
any mechanic** — cite it in a comment. **The engine coverage gate stays at 100%** for every slice.

## Status — the core game is complete ✅

Container is **fully playable in hotseat and online**, with server-side AI seats. All core slices and
the AI end-to-end (A0–A2) shipped; remaining work is difficulty/search (A3–A5), which lives almost
entirely inside `bot/`.

- ✅ **Slice 0 — Produce (architecture proof):** Produce wired engine→API→UI, tests at every layer.
- ✅ **Slice 1 — Turn spine + Build:** `Action` union + `applyAction`/`endTurn`/`legalActions`, 2
  actions/turn with active-player enforcement, Build factory/warehouse (costs, limits, distinct colors,
  building supply). Canonical `POST /games/:id/actions`.
- ✅ **Slice 2 — Pricing & Reprice:** districts are priced lots (`StoredContainer[]`); factory $1–$6,
  harbor $2–$7. Produce places into chosen lots; `reprice` rearranges a district.
- ✅ **Refactor R1 — Engine modularization:** split the monolith into `core/` / `internal/` / `actions/`
  with barrels + per-piece tests. (Superseded by the C3 per-game reorg — Container now lives under
  `engine/src/games/container/`; see CLAUDE.md → "Engine module layout".)
- ✅ **Slice 3 — Ships & sailing:** each player has a ship (`ShipLocation` = ocean / opponent harbor /
  island / bank, cargo ≤ `SHIP_CAPACITY` 5). `sail` moves one hop; `legalActions` enumerates targets.
- ✅ **Slice 4 — Trade chain:** `factoryPurchase` (opponent factory → your harbor by truck, pay the
  owner) and `harborPurchase` (docked ship → load an opponent's harbor goods). Produce → sell → resell →
  load works end-to-end.
- ✅ **Slice 5 — Delivery auctions:** container supply tracked (drawn down by Produce; the end-game
  clock). Sailing a loaded ship to Container Island forces a delivery auction (`mustDeliver` +
  `deliver`): opponents bid, highest wins cargo into their `scoringArea`, the deliverer collects the bid
  **plus a matching subsidy**; the turn ends. **Buyout** and **runoff** ties are in; `$0` bluff bids work
  by construction. *(A still-tied runoff went to the earliest seat here; **A1b** replaced that with the
  rulebook's "the deliverer chooses".)*
- ✅ **Scoring cards (Slice 7 groundwork):** `ScoringCard` + a 5-card deck (`SCORING_CARDS`); `createGame`
  deals one per player (backend shuffles), the UI reveals only the active player's.
- ✅ **Slice 6 — Off-Shore Bank & loans:** loans (`requestLoan`/`repayLoan`, $10, max 2, start-of-turn
  interest, default seizure order); Bank board (cash lots I/II/III + container lots + tokens);
  container-lot auctions (`callBank` bids cash → holding → `loadHolding`) and cash-lot auctions (bid
  containers). Interest, defaults and buyouts flow into the Bank.
- ✅ **Slice 7 — Game end & final scoring:** ends when the supply runs out of **2 colors** (checked at
  turn-advance); open Bank auctions awarded, then `finalScoring` (discard most-common w/ two-value rule,
  island score by card, leftover $3/$2/$0, −$11/loan) and winner (total → factory tiebreak → shared).
  `applyAction` rejects once `ended`; the UI shows a results screen.
- 🎉 **The core game is complete and finishable in hotseat.**
- ✅ **Slice 8 — UI/UX polish & board:** original SVG container/ship art, a `BoardMap` minimap with
  click-to-sail, motion + a11y (reduced-motion-aware), per-viewport visual-regression baselines.
- ✅ **Slice 8a — visual overhaul (2026-07, comps-approved).** The board became a **mariner's chart**
  (`art/Chart.tsx`, aged-parchment style, original art): depth contours, graticule, dotted rhumb routes
  radiating from the charted ocean waypoint (every sail is one hop through open water), Container
  Island with docks, the Off-Shore Bank as a commercial building ($ plate), seat-tinted quays, and a
  fixed-aspect `CompassRose` (the stretch layer would distort it). The **ship** (`art/Ship.tsx`) is a
  squared-bow freighter whose `cargo` prop renders the actual load — deck plan 3 across + 2 stacked
  (SHIP_CAPACITY 5) — used with real cargo on the map, and empty on the mat where the live
  `cargo-<id>` `ContainerChip`s overlay the deck (preserving the e2e span-count contract). **Player
  cards became spatial mats** (`panels/mat/`): seat-color ribbon + money strip (loans live there),
  factory district (store lots + Produce in-zone), harbor district (warehouses + lots + Build
  warehouse), dock (ship, cargo aboard, location caption, Sail/Load-from-bank), island/card/holding
  footer, and `controls` as the End-turn console strip. `ActionControls.tsx` dissolved into the zones;
  `seatColors.ts` is the one seat-color source for map + mats. Every pre-mat testid and text contract
  was preserved (112 non-visual e2e specs passed unchanged); the 4 `board-map` baselines were
  regenerated (darwin + linux, scoped so the Stone Age baselines didn't churn).
- ✅ **UX — activity feed:** a running "Activity" log at the bottom of the board narrates every move in
  plain English (newest first, 🤖 for AI seats). Safe straight from `GameState.log` — the engine only
  records public information (losing delivery bids are never written down, pinned by exact-payload tests).

> **Convention:** new mechanics are `actions/<name>.ts` + a matching `tests/<name>.test.ts`, reusing
> `internal/` helpers. Keep files small and single-responsibility.

## Core game — vertical slices (all complete ✅)

| # | Slice | Delivers (demo) | Size | Depends on |
|---|-------|-----------------|------|------------|
| 1 | ✅ Turn spine + Build | Players alternate turns; build factories/warehouses; Produce is a real "action" | M | Slice 0 |
| 2 | ✅ Pricing & Reprice | Containers live in price lots ($1..$N); set/rearrange prices | M | 1 |
| 3 | ✅ Ships & sailing | Ship tokens move ocean ↔ harbors ↔ islands; legal movement | M | 1 |
| 4 | ✅ Trade chain | Full produce → sell to harbor → load onto ship between players | M–L | 2, 3 |
| 5 | ✅ Delivery auctions | Deliver to Container Island; secret bids, subsidy, buyout, runoff ties, scoring | L | 4 |
| 6 | ✅ Off-Shore Bank & loans | Loans + interest + default; Bank board + container-lot & cash-lot auctions | L | 3 |
| 7 | ✅ Game end & final scoring | Play a full game to a declared winner | M | 5, 6 |
| 8 | ✅ UI/UX polish & board | Original SVG art, board minimap, motion + a11y, visual-regression baselines | M–L | 7 |

Detailed per-slice rulebook references and design notes are preserved in this repo's git history (the
pre-C3 monolithic `ROADMAP.md`); the Status list above is the working summary.

---

## Track A — AI play (Container's bot)

Container has hidden information (secret scoring cards, sealed auction bids) and bluffing, so AI is a
real project. The engine's **purity + serializability** is the key enabler: bots can *simulate* freely.
Container's bot lives in `bot/` (`@game-hub/bot`); the **per-game reorganization** of that package (so a
second game can have its own bot) is a platform item in the top-level roadmap.

| # | Step | Delivers | Size |
|---|------|----------|------|
| A0 | ✅ `@game-hub/bot` + greedy bot + self-play | `decide(view, playerId) → Action`, `bidFor(...)`; headless self-play proves the brain with no server | M–L |
| A1a | ✅ Delivery auction as coordination state | Pending auction outside the engine; each opponent bids from **their own device** | L |
| A1b | ✅ Runoff + deliverer's tie choice | Tie → runoff round; still tied → the deliverer **chooses** (pg. 16) | M |
| A2 | ✅ Bot seats end-to-end | Backend `BotRunner`; hotseat "add AI player"; lobby "assign seat to AI" | M–L |
| A3 | Difficulty tiers + auction modeling | Easy/Normal/Hard; opponent-card estimation; basic bluff/counter-bluff | L |
| A4 | Search-based bot (ISMCTS) | Information-Set Monte-Carlo Tree Search with determinization over hidden info | L |
| A5 | Self-play tuning | Calibrate difficulty & heuristics from batch self-play results | M |

**Decisions taken at Track A kickoff:**

- **Bots run server-side.** A backend `BotRunner` watches games and applies actions for bot seats, so
  hotseat and remote play use *one* implementation and a game keeps moving with no browser open. The UI
  stays a dumb observer — it never drives a bot.
- **Bots live in `@game-hub/bot`**, a sibling of `engine` with its **own ~90% coverage gate** so
  heuristic tuning doesn't fight the engine's 100% bar. **Engine = rules, bot = opinions.** No bot code
  enters `engine/`.
- **Bots decide from a `GameView`, not a `GameState`** — `decide(viewFor(state, botId), botId)`. Feeding
  the bot the redacted view makes cheating *structurally impossible* rather than a matter of discipline.
- **Bot-ness is not engine state.** Which seats are bots is coordination state (a `game_bots` table),
  never in `GameState`. The engine must not learn what a bot is.

**Shipped (A0–A2):**

- ✅ **A0 — greedy bot + self-play driver.** 90% coverage gate; policies mirror the engine's conventions
  (`policies/{pricing,economy,trade,voyage,bank,rank}.ts` + `valuation.ts`).
  - **Parameter completion is where the strategy lives.** `legalActions` returns five of twelve actions as
    bare *markers* that `applyAction` throws on; `rank()` completes them, and deciding *what price / what
    bid / what to buy* is the policy.
  - **Valuation delegates to the engine's own `finalScoring`** rather than re-deriving it — load-bearing,
    because the discard rule means a container's marginal value can be **negative** (`gainFrom`, never
    `card.values[color]`).
  - **⚠️ Greedy bots cannot see a multi-action payoff.** Scored per hop, the 4+-action delivery run ranks
    below producing again, so ships never sailed (a 5p game ran 52 turns with **zero deliveries**). Fixed
    by scoring long chains against the *goal*, not the hop.
  - **Known, deferred to A5:** `RESALE_PER_CONTAINER = 3` is calibrated not derived; 5-player self-play
    shows a seat bias (p1 won 5/5) worth investigating before trusting difficulty tiers.
- ✅ **A1a — the delivery auction as coordination state** (`backend/src/games/container/auctions.ts`,
  `delivery_auctions` table). The engine gained only an exported `mustDeliver`; it still has no concept of
  a half-finished auction. Bids are secret server-side (`auctionViewFor` reveals nothing until the last
  opponent commits, over REST *and* WS). Off-turn loans (pg. 16) landed with it. Also closed the standing
  secret-bid leak (bids used to be typed on the deliverer's screen).
- ✅ **A1b — runoff + the deliverer's tie choice.** Phases `bidding → runoff → decision`; still-tied →
  `CHOICE_REQUIRED`. **⚠️ `deliveryOutcome(...)` is the ONE copy of the tie rule** — the backend projects
  the auction from it and the bot predicts the price with it. Never re-derive who wins.
- ✅ **A2 — bot seats end-to-end** (`BotRunner`, `botRunner.ts`). The runner has **no special powers**:
  same `@game-hub/bot` policies as self-play, same `applyAction`, same `applyBid` as the REST route,
  deciding from `viewFor(state, botId)`. **⚠️ `tick` runs on read as well as write** so a restarted game
  can't wedge on a bot's turn with no human able to unstick it.

**Remaining (A3–A5) — almost entirely inside `bot/`:**

- **A3 — Difficulty tiers + auction modeling.** Easy/Normal/Hard; opponent-card estimation; basic
  bluff/counter-bluff. Also a small "thinking" delay so bots don't play instantly at a shared screen.
- **A4 — Search-based bot (ISMCTS).** The standard fit for hidden-info auction games; the deterministic
  engine rolls out thousands of sampled games cheaply. Determinization samples opponents' unseen cards
  from `SCORING_CARDS` minus the bot's own — the bot must reconstruct a plausible `GameState` to simulate,
  since a `GameView` isn't feedable back into the engine.
- **A5 — Self-play tuning.** Calibrate difficulty & heuristics (and the deferred `RESALE_PER_CONTAINER`
  and the 5-player seat bias) from batch self-play.
