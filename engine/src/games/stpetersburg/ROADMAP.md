# Roadmap — Saint Petersburg

The per-game roadmap for **Saint Petersburg** (first edition, Michael Tummelhofer 2004; the 2009 Rio
Grande printing), game 4 on the platform. Tracked across every layer: engine
(`engine/src/games/stpetersburg/`), backend module (`backend/src/games/stpetersburg/`), UI client
(`ui/src/games/stpetersburg/`), and — last — its bot. Platform work lives in the top-level
[`ROADMAP.md`](../../../../ROADMAP.md).

Rulebook: `reference_materials/StPetersburg2009_Rules.pdf` (10 pp). **Read the relevant page before
implementing a mechanic** — cite it in a comment. **The engine coverage gate is 100%.**

## The game, in one paragraph

A 2–4 player card-buying engine game played over ~7–10 rounds of **four phases** — worker (green) →
building (blue) → aristocrat (orange) → trading (tri-color) (pg. 2). Each phase: players act in turn
(buy a card / add one to a hidden hand / play one from hand / pass — the phase's actions end when all
players pass consecutively, pg. 3), then **score every card of that phase's type** they own (money,
points, or both; no scoring in the trading phase, pg. 4–5), then the administrator refills the board's
**upper row** from the *next* phase's stack to 8 cards total (pg. 4). Round end: lower row discarded,
upper row slides down, workers refill, starting-player markers pass left (pg. 5). Trading cards
**displace** a same-color card you own (cost = difference, min 1; green pairs must match ware symbols,
pg. 7). Game ends when any stack's last card is dealt — finish the round, then final scoring: **distinct
aristocrats** by the board table, money ÷10, **−5 per card left in hand** (pg. 5–6). Ties: most money.

## Why this game (platform notes)

The first three games barely used two seams this one lives on:
- **Real hidden information** (pg. 2–3): a player's **hand** (≤3 cards; 4 with warehouse) *and their
  rubles* are secret. `viewFor` must redact both from day one — opponents see hand *count* and nothing
  else. The first bot that must decide from a genuinely incomplete view.
- **Continuous deck randomness**: four shuffled stacks feed the board every phase — `createGame({rng})`
  shuffles; refills just pop (deterministic), but the **Observatory** (pg. 8) adds a mid-phase
  server-side draw (a `ModuleContext.rng`-adjacent reveal with a forced follow-up decision).
- **The deck order is a real secret** — apply the §4.6 lesson from day one: the view carries stack
  *counts*, never stack contents.

## Decisions (made at slicing, 2026-07-22)

- **Money is redacted** faithfully (pg. 2 "may never tell") — opponents' rubles show as hidden in every
  view; the score track is public. If play-testing finds this too opaque for a home game, loosening is a
  UI decision later, not an engine one.
- **Administrator is not modeled** — it's the physical game's bookkeeping role; the engine does the
  dealing/refilling/scoring itself at phase boundaries.
- **Starting-player markers** are per-phase-type (4 markers rotating left each round, pg. 5) — state
  carries `startingPlayer[phase]`, dealt randomly at setup via the starting-player cards (pg. 2:
  4p = 1 each; 3p = youngest gets 2; 2p = 2 each → model as rng deal of the 4 markers).
- **Pass is not sticky** (pg. 3): a passed player may act again on their next turn; the phase's actions
  end when **all players pass consecutively in seat order**. State needs a consecutive-pass counter,
  not a passed-out set.

## The build plan — vertical slices

### SP0 — Bootstrap ✅
Registered, creatable, viewable fourth game beside the other three. State shape (players: rubles,
play area grouped worker/building/aristocrat, hand; board: upper/lower rows, four stacks, discard
count; round, phase, per-phase starting players, consecutive-pass count), `createGame` (25 rubles,
shuffled stacks from `rng`, marker deal, seed the upper row with workers — **8/6/4 by player count**,
pg. 2 & 8), **redacting `viewFor` from the start** (opponent hands → count, rubles → hidden, stacks →
counts). Inert `applyAction` (`NOT_IMPLEMENTED`), module registered (palette + seat bounds 2–4),
read-only UI board, landing blurb/rules. Engine 100%; backend coexistence suite; e2e picks it.

**What shipped (SP0):** the full engine scaffold under `engine/src/games/stpetersburg/` (kernel
`record`/`makeSeating`/`GameEndState<R>` from day one), the **116-card deck data** in `core/constants.ts`
(31/28/27/30 by group — pg. 1's "120 cards" is 116 game cards + the 4 starting-player cards, which we
model as `startingPlayers` seat markers, not deck cards; all costs/incomes/points read off the rulebook
art at 600 DPI, with the building/aristocrat *trading* cards a documented adaptation since the rulebook
enumerates only Mariinskij/Tax-man/Abbot). **Redacting `viewFor`** proven by a serialized wire test
(no opponent card ids / ruble values on the wire) and a backend REST+WS test. Backend `GameModule`
registered (palette `['blue','yellow','green','red']`, seat bounds 2–4, `parseAction` refuses all until
SP1); a read-only UI board renders the two rows, stack counts + phase indicator, and each seat's rubles
(own) / 🔒 (opponents). Verified green: engine 384 @ 100%, bot 157, backend 214, e2e 124, typecheck clean.

- **Deck decision (worker income):** all six workers pay **income 3** (verified off the 600-DPI render —
  lumberjack cost 3/income 3, gold miner cost 4/income 3, proving coin=income≠cost); weaving mill & wharf
  upgrade to 6. This 2009 Rio Grande printing differs from what one might recall — the rulebook art wins.
- **Deferred to SP4** (documented `ADAPTED` inline): exact cost/reward of the nine non-Mariinskij building
  trading cards and the eight non-exemplar aristocrat trading cards. Right counts/colours; plausible spread.

### SP1 — The phase spine: buy, pass, score, refill
The action loop (pg. 3): `BUY {row, index}` and `PASS`, turn order from the phase's starting player,
actions end on all-pass-consecutively. Buying (pg. 3, 6): pay cost with **cumulative reductions** —
−1 per same-named card owned, −1 from the lower row, (smelter/workshop hooks land with their cards) —
**minimum 1 ruble**, card into the play area grouped by type. Phase **scoring** (pg. 4): every card of
the phase's type pays its money/points. **Refill** (pg. 4): upper row from the *next* stack to 8 total
on board. The worker phase is playable end-to-end and rests at the building phase.

**What shipped (SP1):** the phase spine is live end-to-end. Two client actions — `BUY {row, index}` and
`PASS` — flow through `applyAction` in turn order from the phase's starting player, clockwise, wrapping
(a passed player still gets turns). A **buy** charges `effectiveCost` = printed cost − cumulative
reductions (−1 per same-*named* card owned, −1 from the lower row), floored at **1 ruble** (pg. 6), moves
the card into the play area grouped by kind, resets the consecutive-pass counter and passes the turn. A
**pass** counts toward `consecutivePasses`; when it reaches the player count the phase's actions end and
the closing pass folds in a single deterministic transition (`internal/phase.ts` `scoreAndRefill`):
**score** every player's cards of the phase kind (coin → secret `rubles`, shield → public `points` — a new
player field), then **refill** the upper row from the *next* phase's stack to 8 on board (dealing short
without ending — SP6 owns the end trigger), then advance the phase and seat its starting player.
`legalActions` enumerates the active seat's affordable non-trading buys + pass, reading only own-seat
knowledge (no hidden-info leak). Backend `parseAction` accepts BUY/PASS; the new error codes
(`INSUFFICIENT_RUBLES`, `INVALID_CARD_SLOT`, `TRADING_NOT_BUYABLE`, `PHASE_CLOSED`) map to 409. The UI board
is interactive — affordable cards are buttons showing the effective cost with the printed cost struck
through when reduced, a Pass button, both gated on `canDrive`; the activity feed narrates buys ("Ann bought
the Lumberjack for 3₽") and phase-close scoring. Verified green: engine **406 @ 100%**, bot 157 (untouched),
backend **215**, e2e **126**, typecheck clean, visual baselines untouched.

- **Row model — compaction (decided).** A bought card is spliced out of its row, so a row is always a
  dense list and `BUY.index` is a position in the *current* row, not a fixed slot. The rulebook's "slide
  the remaining cards to the right" is physical bookkeeping the engine needn't model; the view and UI both
  read the compacted rows, so they stay consistent. Refills append to the upper row.
- **Trading-buy refusal is an SP4 seam.** Buying a trading card throws `TRADING_NOT_BUYABLE` — trading
  cards are bought by *displacing* a same-colour card you own (pg. 7), which the engine can't do until SP4.
  `legalActions` omits them and the UI never makes them buttons.
- **Smelter / workshop reductions are a documented seam** in `costReductions` (a comment + the cumulative
  sum), not yet implemented — those reducing cards are trading cards that can't be owned until SP4/SP5.
- **SP1 boundary — the trading phase rests.** SP1 stops after the aristocrat→trading handoff: aristocrats
  score and the board refills from the trading stack, then the trading phase runs on the same machine
  (leftover non-trading cards are still buyable; trading cards refused). When the trading phase's actions
  end, SP1 applies **no scoring** and does **not** advance (SP2 owns the round transition). It rests with
  `consecutivePasses === player count` marking the phase closed; `applyAction`/`legalActions` treat that as
  terminal (`PHASE_CLOSED`). This is the SA1 "rests at the next phase" pattern.

### SP2 — Full round loop + trading-phase frame ✅
Building and aristocrat phases (same machine), the no-scoring trading phase (pg. 5), and the round
transition (pg. 5): discard the lower row, slide upper → lower, refill workers to 8, rotate all four
markers left, next round. The pg. 8 special case (nobody takes a card → no refill, but stacks still
turn) included. A full multi-round game loops (no end trigger yet).

**What shipped (SP2):** the round loop is closed. The trading phase's actions now run on the same
all-pass machine and — with **no scoring** (pg. 5) — its close runs `internal/phase.ts`
`roundTransition`: **discard the lower row** (discard count grows), **slide upper → lower**, **refill
workers to 8** from the worker stack, **rotate all four starting-player markers one seat left**
(`rotateMarkersLeft`), and open the next round's worker phase (round++). The SP1 "trading rests closed"
seam is gone — `PHASE_CLOSED` and its `applyAction`/`legalActions` guards were removed (a
now-unreachable dead-end). `legalActions` in the trading phase offers only `PASS` plus any leftover
non-trading buys (trading cards stay refused until SP4) — asserted explicitly.

- **Marker rotation direction (pg. 5, verified):** "give their starting player markers to their **left
  neighbors**" = the next seat in turn order (the pg. 5 diagram arrow runs B→C, i.e. in play order), so
  a marker at seat `i` moves to `i+1`. New starting player for each phase = the successor of the old.
- **The pg. 8 special-case reading (cited in `phase.ts`):** "Special case: no cards are bought or added…
  the administrator will **add no new cards to the board**. He will, however, **turn the card stacks**…"
  A per-phase **`tookCardThisPhase`** flag (set by a buy — and, from SP3, an add-to-hand; reset when a
  phase begins) gates the **mid-round phase refill** — the step that "adds new cards to the board." If no
  card left the board during a *scoring* phase's actions, **that phase's refill is skipped** but the
  stacks still turn (the phase advances and still scores). A short board is not an end trigger (SP6 owns
  that); it just means "eventually players buy again" (pg. 8).
  - **⚠️ Correction (a live play-test bug, fixed in SP3 — do not restore the old reading).** SP2
    *originally* extended this gate to the **worker deal at the round transition** too: if nobody took a
    card during the trading phase, no workers were dealt back. That was **wrong**, and it drained the
    board permanently — the trading phase currently can take **no** cards (trading buys refused until SP4;
    ADD_TO_HAND arrives only in SP3), so every trading phase ended card-less → every rollover skipped the
    worker deal while still discarding the lower row → the board shrank to empty and never recovered (the
    owner reproduced it). The correct reading, now in `roundTransition`: **pg. 8's special case modifies
    the mid-round phase-end refill only; pg. 5's round-end sequence — discard lower, slide upper→lower,
    deal workers to 8 — is the *new round's setup* and runs unconditionally.** So the pg. 8 gate stays on
    `scoreAndRefill` (mid-round) but is gone from `roundTransition` (round-end). Regression:
    `round.test.ts` "deals workers at every rollover even when no card is ever taken".
- **Multi-round proof:** `tests/round.test.ts` drives a deterministic 4-player game through two full
  rounds via `applyAction`, asserting the slide/discard arithmetic, all-four-marker rotation, and the
  exact round-2 / round-3 entry state (with mid-round pg. 8 skips still firing, but the round-end worker
  deal now unconditional per the SP3 correction above).
- **Verified green:** engine **411 @ 100%**, bot 157 (untouched), backend **216**, e2e **128**,
  typecheck clean, visual baselines untouched.
- **UI:** each seat's panel now shows its starting-player marker chips (`sp-marker-<phase>-<playerId>`),
  which visibly hop one seat left at the rollover; the feed narrates it ("passed — Round 2: lower row
  discarded, markers passed left"). The dead "trading phase has ended" SP1 message is gone.

### SP3 — The hand ✅
`ADD_TO_HAND {row, index}` (free, limit 3 — pg. 3) and `PLAY_FROM_HAND {index}` (pay full cost with
reductions, min 1). Redaction proof: backend test that an opponent's view never contains hand
contents, only the count (the §B1-style wire test). UI: your hand as cards, opponents as face-down
count.

**What shipped (SP3):** the hidden hand is live end-to-end.
- **`ADD_TO_HAND {row, index}`** (`actions/addToHand.ts`) takes a row card into the active seat's hand
  for **free** (pg. 3), rows compact like a buy, up to `handLimit(player)` cards (over → `HAND_FULL`). It
  is an action: sets `tookCardThisPhase`, resets the pass counter, passes the turn.
- **`PLAY_FROM_HAND {index}`** (`actions/playFromHand.ts`) plays a held card into the play area in **any
  phase** (pg. 3), charged `handCost` (reductions **except** the lower-row discount, min 1). It does
  **not** set `tookCardThisPhase` (the card came from the hand, not the board), so it triggers no board
  refill.
- **Reduction refactor.** `buy.ts` split the row-independent reductions (`baseReductions` — the
  same-name −1, plus the SP4/SP5 smelter/workshop seam) out of `costReductions` (= base + lower-row −1),
  with a shared min-1-ruble floor (`afterReductions`). `effectiveCost` (row buy) and the new `handCost`
  (hand play — base only, no row) both build on it, so the min-1 floor and the reductions live in one
  place. The hand limit is a **function seam** (`handLimit(player)` → `HAND_LIMIT` = 3) so SP5's Warehouse
  (limit 4) hooks it without touching callers.
- **Trading cards in hand — ruling (pg. 3 + pg. 8, cited in `addToHand.ts` / `playFromHand.ts`).**
  Trading cards **are** hand-eligible for `ADD_TO_HAND`. The **buy** action is worded "1 worker or 1
  building or 1 aristocrat" (pg. 3) — the three non-trading colours — but **add-to-hand** is worded "takes
  **1 card** from either card row", the Remember bullet reads "add to his hand **any** of the cards on the
  board", and the Observatory (pg. 8) lets a drawn card of *any* group be "add[ed] to his hand". So a
  trading card may be **held**. It just can't be **played**: `PLAY_FROM_HAND` of a trading card is refused
  with `TRADING_NOT_BUYABLE` (the SP4 displacement seam). This can't wedge the game — passing is always
  legal, and SP6's −5-per-hand-card scores the stuck card.
- **Redaction.** Hands were redacted from SP0; the wire test now exercises a **non-empty** hand surviving
  an add → play round-trip (owner sees contents; opponent sees the count only, never the card id on the
  wire). `legalActions` derives `PLAY_FROM_HAND` from the **viewer's own hand** only (no leak), offers
  `ADD_TO_HAND` for every row card while the hand isn't full (free — any card, trading included), and
  keeps trading cards out of buys/plays.
- **Log-visibility nuance (documented, cited).** The take is **public at the moment it happens** — on the
  physical table everyone sees which card you lift from the open rows — so the feed **names** it ("Ann
  took the Judge into hand"), and `addToHand` logs `cardName`. The hand is secret only as a *set*
  afterward, which redaction already handles (opponents get a count). Nothing hidden is logged.
- **pg. 8 flag.** `ADD_TO_HAND` sets `tookCardThisPhase` (SP2 left the hook noted) — a card leaving the
  board via a hand take now correctly runs that phase's refill, and makes trading-phase takes possible.
- **Also fixed here:** the round-end board-drain spiral (see the SP2 pg. 8 **Correction** above).
- **UI:** the viewer's own hand renders as playable cards (`sp-play-<i>`, effective cost shown, trading
  cards shown disabled with a "needs SP4" state); each row card gains a free **+ Hand** affordance beside
  Buy (`sp-hand-<cardId>`), hidden once the hand is full; opponents' hands render as a **face-down count**
  chip (`sp-handcount-<playerId>`). The feed narrates adds (naming the card) and hand plays.
- **Verified green:** engine **427 @ 100%**, bot 157 (untouched), backend **219**, e2e **132**, typecheck
  clean, visual baselines untouched.

### SP4 — Trading cards ✅
`BUY`/`PLAY_FROM_HAND` of a trading card requires a displacement target (pg. 7): same color; green
needs matching ware symbols (five fixed pairs); blue displaces any building, orange any aristocrat;
trading cards never displace trading cards; Czar Peter displaceable by any green. Cost = difference,
**min 1**; displaced card discarded. The full 30-card trading deck data (pg. 9–10 card sheet).

**What shipped (SP4):** trading cards are buyable/playable end to end via displacement.

- **Action shape (chosen): a `displace?: string` on `BUY` and `PLAY_FROM_HAND` — the *instance id* of the
  card to discard, not a play-area index.** An id is stable (immune to compaction) and self-validating.
  Three typed errors enforce the shape (`core/errors.ts`, all → HTTP 409): a trading card with no target is
  `DISPLACE_REQUIRED`; a non-trading card carrying one is `DISPLACE_NOT_ALLOWED`; a stale/wrong/illegal id
  (wrong colour, another trading card, or a green ware mismatch) is `INVALID_DISPLACE_TARGET`. The SP1–SP3
  `TRADING_NOT_BUYABLE` refusal is **removed** (engine + backend + tests); SP3's disabled-hand-play UI is now live.
- **The displacement rules live in `internal/displace.ts`** (`groupOf`, `legalDisplaceTargets`,
  `validateDisplacement`, `placeInPlayArea`) — reused by `buy`, `playFromHand` and `legalActions` so the
  pairing/colour/Czar rules have one home. A placed trading card joins the play-area group it *upgrades*
  (`groupOf` = `tradingGroup`), which is also the group it displaces from. `legalActions` now enumerates one
  `BUY`/`PLAY_FROM_HAND` **per legal target** (a bare trading card with nothing to displace stays omitted).
- **Cost (pg. 7, `displacementCost`):** printed cost − displaced card's printed cost when dearer, else 1
  ruble; then all normal reductions apply (`baseReductions` + lower-row −1 for a buy), min-1 floor.
- **Owned-card reductions are live (pg. 7–8 sheet):** a **carpenter workshop** −1 on every blue card
  bought/played, a **gold smelter** −1 on every orange — keyed off the card's colour *group* (so they fire
  for plain buildings/aristocrats *and* their trading upgrades), folded into `baseReductions` (the SP3 seam),
  cumulative, min-1. Mariinskij/Tax-man scoring effects remain SP5 (they're scoring hooks, not reductions).
- **Data verification (no fixes needed).** Every value the pg. 7–8 sheet prints matches the SP0 deck data,
  verified in tests: the five green-pair costs (carpenter workshop 4−3=1, gold smelter 6−4=2, weaving mill
  8−5=3, fur shop 10−6=4, wharf 12−7=5), the green upgrade incomes/points (weaving mill income 6; fur shop
  income 3 + 2★; wharf income 6 + 1★), Mariinskij cost 10, Tax-man cost 17, and the two worked examples —
  **St Isaac's 15 − Market 5 = 10, then −1 lower-row −1 carpenter-workshop = 8** (confirming an ADAPTED
  building-trading cost against the rulebook), and the **senator = 1 ruble** (same-or-cheaper rule). The 17
  ADAPTED building/aristocrat trading values are unchanged and stay isolated in `core/constants.ts` for a
  future pure-constants patch once physical-card photos arrive.
- **Item 5 (upgrades ride the card data):** a scoring test confirms an upgraded worker pays its printed
  income at phase scoring (weaving mill 6₽; fur shop 3₽ + 2★) through the existing phase machinery.
- **UI:** trading cards in rows/hand are buyable/playable with a displacement picker — one legal target acts
  at once, several open a small chooser (`sp-displace-picker` with `sp-displace-<targetId>` buttons +
  `sp-displace-cancel`); effective cost shown with the difference math. The feed narrates upgrades ("Ann
  upgraded the Lumberjack to the Carpenter Workshop (2₽)", and "… from hand …" for a hand play). All prior
  testids intact.
- **Verified green:** engine **445 @ 100%**, bot 157 (untouched), backend **222**, e2e **134** (incl. a full
  UI displacement flow; visual baselines untouched), typecheck clean.

### SP5 — Special cards
The six specials (pg. 7–8), each behind its own mechanic: **Pub** (after each building scoring, buy up
to 5 points at 2 rubles each — a small decision window, modeled as an interlude the engine offers only
to pub owners), **Warehouse** (hand limit 4), **Mariinskij Theater** (+1 ruble per aristocrat at
building scoring), **Tax man** (+1 ruble per worker at aristocrat scoring), **Potjomkin's Village**
(pay 2 on buy; worth 6 when displaced), **Observatory** (skip its point to draw the top of any chosen
stack — a server-side reveal route feeding a forced buy/hand/discard follow-up, `pendingDraw` state;
flips until round end). This is the slice most likely to split — Observatory last within it.

### SP6 — Game end + final scoring
Trigger (pg. 5): a group's last card dealt to the board → finish all phases of this round → final
scoring: distinct-aristocrat table (1/3/6/10/15/21/28/36/45/55), +1 per full 10 rubles, −5 per hand
card; kernel `GameEndState<R>`; ties by money (then shared). Results UI via the shared `GameOver`.

### SP7 — Playable-game hardening
Backend REST suite playing full seeded games; the honest four-games-coexist check; hotseat + lobby +
colors + resume all work (they're platform-free wins, but the e2e proves it); `describe(move)` for the
shared activity feed; seat palette.

### SP8 — Art & board polish *(moved ahead of the bot, owner call 2026-07-22: playability before bots)*
The comps-on-artifact flow (like Morning Valley / the parchment chart): a proper board with the two
rows, stack/phase indicator, grouped play areas, hand fans. Original art only.

Owner-requested scope (2026-07-22), to be comped before porting:
- **Card iconography**: kind identity as color banding (green/blue/orange, tri-color for trading),
  **ware symbols as real icons on the green pairs** (they gate displacement legality, so visual =
  rules clarity), coin-vs-shield income/point marks, and effective-cost badges. Original glyphs on
  the repo's 24×24 convention — no reproduction of the published cards.
- **Player tableaus**: the platform's detailed-vs-compact split (the Stone Age `PlayerPanel` /
  Container mat pattern) — the viewer's own seat gets a full tableau (play area grouped by kind with
  per-phase income/point summaries, hand as cards), opponents collapse to one-line rows (tableau
  counts per kind, hand count, public score). Seat colors throughout.

### SP9 — Bot
Last, once the game is winnable **and playable-polished**. The first bot deciding from a **redacted**
view (no opponent rubles or hands): value cards by payback horizon (the pg. 8 tips are the seed
heuristics — 2 workers early, expensive cards have better ratios, keep trading-phase money),
hand-speculation risk (−5), displacement chains. Self-play 2–4p seeded; strength benchmark per the
calibrate-then-commit convention (baseline: a frozen greedy first cut, the Stone Age pattern).

## Scope notes

- 2–3 player differences are **only** the initial worker seeding and marker deal (pg. 8) — land them in
  SP0/SP1, not as a later variant.
- The card sheet (pp. 9–10) is the authoritative card list (names, costs, incomes, counts). Encode it
  once as deck data with a test asserting the printed totals (31/28/27/30, pg. 1).
