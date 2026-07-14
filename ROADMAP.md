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
  cosmetic and out of scope.)*
- ⏭️ **Next: Slice 6 — Off-Shore Bank & loans.**

> **Convention going forward:** new engine mechanics are added as `actions/<name>.ts` + a matching
> `tests/<name>.test.ts`, reusing `internal/` helpers. Keep files small and single-responsibility.

---

## Core game — remaining vertical slices

| # | Slice | Delivers (demo) | Size | Depends on |
|---|-------|-----------------|------|------------|
| 1 | ✅ Turn spine + Build | Players alternate turns; build factories/warehouses; Produce is now a real "action" | M | Slice 0 |
| 2 | ✅ Pricing & Reprice | Containers live in price lots ($1..$N); set/rearrange prices | M | 1 |
| 3 | ✅ Ships & sailing | Ship tokens move ocean ↔ harbors ↔ islands; legal movement | M | 1 |
| 4 | ✅ Trade chain | Full produce → sell to harbor → load onto ship between players | M–L | 2, 3 |
| 5 | ✅ Delivery auctions | Deliver to Container Island; secret bids, subsidy, buyout, runoff ties, scoring areas | L | 4 |
| 6 | Off-Shore Bank & loans | Loans + interest; bank auctions (both lot types) | L | 3 |
| 7 | Game end & final scoring | Play a full game to a declared winner | M | 5, 6 |
| 8 | UI/UX polish & full board | Complete board, animations, a11y, richer responsive, visual regression | M–L | 7 |

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
Complete board layout, ship/auction animations, accessibility pass, richer responsive breakpoints,
and **Playwright visual-regression snapshots** (baseline screenshots per viewport).

**After Slice 7 the game is fully playable hotseat.** Slice 8 and both tracks below are independent.

---

## Track A — AI play (after the core game is playable, Slices 1–7)

Container has hidden information (secret scoring cards, sealed auction bids) and bluffing, so AI is a
real project. The engine's **purity + serializability** is the key enabler: bots can *simulate* freely.

| # | Step | Delivers | Size |
|---|------|----------|------|
| A0 | Bot harness | `Bot = (view, legalActions) → action`; headless self-play driver; hardened legal-move generator | M |
| A1 | Greedy heuristic bot | Playable **single-player vs AI**; scoring-card-aware production/pricing/delivery; EV-based auction bids | M–L |
| A2 | Difficulty tiers + auction modeling | Easy/Normal/Hard; opponent-hand estimation; basic bluff/counter-bluff | L |
| A3 | Search-based bot (ISMCTS) | Information-Set Monte-Carlo Tree Search with determinization over hidden info, using engine sim | L |
| A4 | Self-play tuning | Calibrate difficulty & heuristics from batch self-play results | M |

- **Prerequisite (A0):** a solid **legal-action generator** and a **per-player "view"** of state
  (what a bot/player may see — its own hand/card hidden from others). Both are also needed by the UI
  and by online play, so build A0's view model with Track B in mind.
- **Why ISMCTS (A3):** it's the standard fit for hidden-info, auction/trick games; the deterministic
  engine lets it roll out thousands of sampled games cheaply.

## Track B — Online multiplayer (independent; can start after Slice 4+)

| # | Step | Delivers | Size |
|---|------|----------|------|
| B1 | Server-authoritative views | Per-player state projection (hidden info enforced **server-side**, never sent to the wrong client) | M–L |
| B2 | Real-time transport | WebSockets, lobbies/rooms, join codes, reconnection & resume | L |
| B3 | Accounts & persistence | Auth, saved/resumable games, spectators | M–L |

The v1 hotseat engine is already authoritative and serializable, so online is **additive** — B1 mostly
formalizes "what each player is allowed to see," which A0 also needs.

---

## Pacing & credits

- **One slice per session** is a good default. Each ends with green tests and a working demo, so it's
  a clean checkpoint to commit and pause.
- The **L** slices (5, 6, A2, A3, B2) each have a noted seam — split them if you want a shorter run.
- **Before starting a slice,** check your remaining plan usage so you don't land mid-slice. If usage
  looks tight, pick an **M/S** item (e.g. Slice 7 is smaller than 5/6; A0/A4 are lighter than A2/A3).
- Suggested order: **1 → 2 → 3 → 4 → (5 and 6 in either order) → 7 → 8**, then Track A and/or B.
