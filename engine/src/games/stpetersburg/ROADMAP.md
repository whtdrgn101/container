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

### SP5 — Special cards ✅
The six specials (pg. 7–8), each behind its own mechanic: **Pub** (after each building scoring, buy up
to 5 points at 2 rubles each — a small decision window, modeled as an interlude the engine offers only
to pub owners), **Warehouse** (hand limit 4), **Mariinskij Theater** (+1 ruble per aristocrat at
building scoring), **Tax man** (+1 ruble per worker at aristocrat scoring), **Potjomkin's Village**
(pay 2 on buy; worth 6 when displaced), **Observatory** (skip its point to draw the top of any chosen
stack — a forced buy/hand/discard follow-up, `pendingDraw` state; flips until round end).

**What shipped (SP5):** all six specials are live end to end, each in its own mechanic, with **no**
backend routes / `pendingStep` / per-turn rng — every special is a *rule*, so it lives in the engine.
Engine **476 @ 100%**, bot 157 (untouched), backend **225**, e2e **134**, typecheck clean, visual
baselines untouched.

- **Two engine-level turn locks** (like Stone Age's `pendingGather`), both refusing every other `/actions`
  move with a typed 409 and both projected **public** (no secret to redact):
  - **`pendingPubBuy { queue: number[] }`** — the Pub window. When the building phase's actions close, `pass`
    **scores first** (`internal/phase.ts` split into `scorePlayers` + `advanceAfterScoring`), then — if any
    seat owns a Pub — pauses with the pub-owner seats queued in seat order; the head is `activePlayerIndex`.
    `PUB_BUY { points }` (0 = decline) charges `2 × points`, adds the points, pops the head; when the queue
    empties the deferred `advanceAfterScoring` (refill + next phase) finally runs. `actions/pubBuy.ts`.
  - **`pendingDraw { seat, stack, card, observatoryId }`** — a rolled Observatory draw awaiting its forced
    follow-up. `OBSERVATORY_DRAW { stack }` (building phase, instead of a normal action) pops the stack top
    into `pendingDraw` and locks the seat; `OBSERVATORY_RESOLVE { choice, displace? }` buys / hands /
    discards it, flips the Observatory, and passes the turn. `actions/observatory.ts`.

Rulings (each cited in code):
- **Pub — 5 points *per player*, not per card** (there are 2 Pub copies). The sheet reads "*the* player can
  buy up to 5 points" (per-player wording), so `pubOwnerSeats` lists a seat once even with two Pubs. Whole
  points only ("cannot buy 2 rubles for 1 point"): `points` is an integer 0–5, `INVALID_PUB_POINTS` otherwise.
- **Warehouse — hand limit 4, not a forced discard.** `handLimit(player)` (the SP3 seam) returns 4 if the
  play area holds a Warehouse. It reads the *current* play area, so the limit drops back to 3 the instant a
  Warehouse is displaced — but `addToHand` only refuses an *add* at/over the limit, so a player holding 4
  when their Warehouse leaves play simply can't ADD until they play back under 3 (no rule forces shedding).
- **Mariinskij Theater — +1₽ per aristocrat at *building* scoring** (`mariinskijBonus`); **Tax man — +1₽ per
  worker at *aristocrat* scoring** (`taxmanBonus`). Both count the whole colour group (plain cards + trading
  upgrades). The cards themselves score nothing (income/points 0).
- **Potjomkin's Village — printed buy cost 2 (ordinary, reducible, min-1); worth 6 when displaced.** The
  "pays 2 rubles when he buys/places" text is just its printed cost (the card box shows 2/6); only the
  displacement value is special — `displaceValueOf` returns 6, so a trading card upgrading a Potjomkin
  computes its difference against 6 (`POTEMKIN_DISPLACE_VALUE`), matching "it is worth 6 rubles".
- **Observatory — scores its 1 point only if unused this round; flipped ones score 0 and may not be
  upgraded.** Per-instance flip tracked in `observatoryUsed: string[]` (2 copies exist), reset to `[]` at the
  round transition ("to begin the next round, he turns it face-up"). A flipped Observatory is excluded as a
  displacement target (`legalDisplaceTargets` — "may not upgrade it while flipped"). The chosen stack "may
  not be the last card": a draw needs ≥2 cards (`STACK_TOO_SMALL`). The buy path pays with base reductions
  and **no lower-row discount** (the card came from a stack, not a row); a trading draw needs a `displace`
  target.
- **Observatory draw is a *pure engine action* (visibility ruling).** The stack top is deterministic
  (shuffled once at setup), so no server-side rng route is needed — `OBSERVATORY_DRAW` is an ordinary client
  action. The drawn `card` is otherwise a stack secret (pg. 2), but the draw happens **openly at the table**
  exactly like an SP3 hand *take*, so `viewFor` **reveals** `pendingDraw` (the card is public the moment it's
  drawn) and the log names it. A to-hand card then merges into the secret hand set afterward (opponents keep
  only the count going forward), identical to SP3. A backend wire test asserts the opponent sees the same
  `pendingDraw.card.id`. **Observatory does not set `tookCardThisPhase`** — the card left a *stack*, not the
  board rows, so the pg. 8 board-refill gate is untouched.
- **`legalActions`** handles all three windows: the Pub branch (PUB_BUY 0..min(5, affordable)), the pending
  draw branch (discard always; hand if room; buy per legal target), the Observatory-draw offer (building
  phase, unflipped Observatory owned, per ≥2-card stack), and the flipped-Observatory displacement refusal.

Testing choices (documented):
- **Engine 100%** is the correctness guarantee — `tests/{specials,pub,observatory}.test.ts` exhaustively
  cover every rule and rejection deterministically (constructed states, no rng).
- **Backend REST** proves parseAction + routing + error mapping (clean 409 refusals out of context, 400 on
  bad shapes) and — via a **seeded** greedy driver (`makeRng(7)`) — a **real Pub buy**, an **Observatory
  draw+resolve** with **pendingDraw revealed to the opponent**, and a **4-card Warehouse hand**.
- **e2e does NOT drive a Pub/Observatory** to completion. A paid Pub buy is not reliably reachable (Saint
  Petersburg's permanent money shortage, pg. 8) and a two-heavy-driver e2e stressed the shared in-memory
  backend into flakiness — exactly the "if not reliably reachable… no flaky specs" caveat. So SP5's UI is
  wired + typechecked, its correctness lives at the engine/backend levels, and the SP4 displacement e2e was
  updated to skip special buildings (so it never triggers an interlude and stays reliable). The `sp-pub-*` /
  `sp-observatory-*` affordances exist for a future seeded/e2e harness.

### SP6 — Game end + final scoring ✅
Trigger (pg. 5): a group's last card dealt to the board → finish all phases of this round → final
scoring: distinct-aristocrat table (1/3/6/10/15/21/28/36/45/55), +1 per full 10 rubles, −5 per hand
card; kernel `GameEndState<R>`; ties by money (then shared). Results UI via the shared `GameOver`.

**What shipped (SP6):** the game ends and scores.

- **The trigger is a `finalRound: boolean` flag on the state** (created `false`), armed **the moment a board
  refill places the last card of any group** (pg. 5: "when the administrator places the **last card of a
  group** … play continues through **all phases of this round**"). `internal/phase.ts` `refillUpper` now
  returns `{ board, placedLast }` — `placedLast` is true iff the deal drew **≥1 card and emptied the stack**,
  i.e. the group's final card was actually placed. **Dealing short of 8 when the stack was already empty
  (drawing zero) is *not* the trigger** — "if there are not enough cards … he places as many as there are"
  (pg. 5) is the shortage clause, distinct from placing the last card. Both refill sites fold it in:
  `advanceAfterScoring` (mid-round phase handoff, gated by the pg. 8 `tookCardThisPhase`) and
  `roundTransition` (the unconditional round-end worker deal). The flag is **sticky** once set.
- **Between-rounds ruling (cited in `roundTransition`):** if the round-end worker deal itself places the
  last worker, that deal seeds the **new** round's worker phase — so the round about to be played out **is**
  "this round" (the round in which the last card was placed), and the game continues through all its phases
  before ending. The alternative (ending the round that just finished) would contradict "play continues
  through all phases of this round." (`roundTransition` runs only when `finalRound` was still false — `pass`
  ends the game instead of rolling over once it is set — so the deal is the only way the flag flips at a
  rollover; no sticky-OR needed there, keeping branch coverage clean.)
- **The end fires when the FINAL round's trading phase closes** (pg. 5). `pass`'s trading branch: if
  `finalRound`, run `finalScoring` (the kernel `GameEndState` `ended` arm) instead of `roundTransition`.
  A **Pub interlude can never straddle the trading close** — the Pub window opens and resolves entirely
  inside the *building* phase, and `applyAction` refuses a `PASS` while `pendingPubBuy` is set — so the
  trading close is always free to end (asserted in `gameEnd.test.ts`).
- **Final scoring (`internal/scoring.ts`, pg. 5–6):** per player `base` (banked track) + `aristocrats`
  (distinct aristocrats by card **identity `key`** across the whole aristocrat group — plain aristocrats
  *and* orange aristocrat trading cards, which both live in `playArea.aristocrat` — scored by the board
  table `ARISTOCRAT_SCORE` = the triangular numbers 1/3/6/10/15/21/28/36/45/55, verified against pg. 6's
  worked example "6 different aristocrats → 21 points") + `money` (`floor(rubles/10)`, pg. 6) − `handPenalty`
  (`5 × hand.length`, pg. 6). **No clamp:** the rulebook states none, so a total can be **negative** if hand
  penalties outweigh the rest (asserted). The table stops at 10 distinct; more (possible only with the
  ADAPTED orange trading deck) scores the max 55 — respecting the board's domain, not an invented tier.
  `StPetersburgResult` carries the full breakdown `{ playerId, base, aristocrats, distinctAristocrats, money,
  handPenalty, total }`. `winnerIds`: highest `total`; tie → **most rubles** (pg. 6); still tied → **shared**.
- **`viewFor` at `ended`** reveals everything (rubles + hands) — established SP0, verified here by a REST
  test asserting redaction *lifts* across the transition (an opponent's rubles/hand go from `null` to the
  real values in the closing move's reply and every later read, spectators included).
- **Backend:** `summarize` already flows `status` through (unchanged — matches the other three games), so an
  ended game drops out of the in-progress resume list. Two REST tests seed near-end states through the
  repository seam (the `persistedCompat.test.ts` pattern, deterministic/fast): one asserts the exact
  breakdown arithmetic + winners + redaction lifting at the final trading close; the other drives the
  **trigger→final-round→ended sequence** from a real board deal (a phase-close refill emptying the trading
  stack arms `finalRound`, the round plays out, the trading close ends it).
- **UI:** the shared `components/GameOver` frame with a `sp-results` breakdown table (per-player
  `sp-result-<id>` rows: base / aristocrats ×distinct / money / −hand / total, winner highlighted). The
  board gates every affordance off `ended` (the controls block and `acting` both check it) — the engine
  refuses moves with `GAME_OVER`, so the board offers none.
- **e2e (documented choice):** driving a whole game to its end through the UI is long and shuffle-dependent,
  so (the roadmap's no-flaky-specs caveat) `e2e/stpetersburg.spec.ts` reaches the end **deterministically
  over HTTP** — an all-pass game empties the worker stack after a fixed number of rollovers *regardless of
  the deck order* (the round-end worker deal is unconditional, pg. 5) — then **loads that ended game in the
  real UI by code** and asserts the GameOver frame + the breakdown table render and that no affordances remain.
- **Verified green:** engine **494 @ 100%**, bot 157 (untouched), backend **227**, e2e **136**, typecheck
  clean, visual baselines untouched.

### SP7 — Playable-game hardening ✅
Backend REST suite playing full seeded games; the honest four-games-coexist check; hotseat + lobby +
colors + resume all work (they're platform-free wins, but the e2e proves it); `describe(move)` for the
shared activity feed; seat palette.

**What shipped (SP7):** the game is now trustworthy, not just rules-complete.

- **Full seeded games over REST (`backend/.../stpetersburg.test.ts`).** One acquisitive driver plays
  **complete** games at **2p / seed 777, 3p / seed 7, 4p / seed 20260722**, each reproducibly touching the
  *whole* surface in a single game — buys from **both rows**, **add-to-hand → play-from-hand**, a
  **trading-card displacement**, a **paying Pub buy**, and an **Observatory draw + resolve** (the driver
  asserts that seven-path coverage, so a future deck/rule change that stops reaching a path fails loudly).
  Each game asserts it **ends** into final scoring, the breakdown is **coherent** (`total = base +
  aristocrats + money − handPenalty`, `winnerIds` obeys the pg. 6 tie rule — highest total, ties on rubles,
  still-tied ⇒ shared — checked against the revealed rubles), **version strictly increases** by one per
  action, and the **move log replays sanely** (contiguous `seq` 1..N, one entry per version, every entry a
  known action type). Seeds were chosen by a coverage probe; all three cover all seven paths.
- **Four-games coexistence, honestly (`module-seam.test.ts`).** All **four** real games *and* the counter
  stub run in one app instance: create one of each, drive a real move into each game's own engine (Container
  PRODUCE / Can't Stop roll-route / Stone Age PLACE / Saint Petersburg PASS / counter BUMP), list all five
  tagged by type. Saint Petersburg declares **no module routes**, so its `/games/:id/stpetersburg/*`
  namespace **404s cleanly** (nothing registered there — asserted for its own row *and* another game's),
  while a cross-game call (`/games/:spId/container/auction`) is still refused by the type guard
  (`WRONG_GAME_TYPE`).
- **Platform features proven in e2e (`e2e/stpetersburg-platform.spec.ts`).** Lobby: two contexts join a
  shared 2-seat game, **pick colours** (blue/yellow), start, and **each sees its own seat identity**
  (`sp-banner` "You are Ann/Bob") **with the colours reflected on the board**. Resume: rejoin an in-progress
  game as a seat — **own rubles visible, opponent's redacted**. Abandon: soft-deleted game stays readable
  but a move returns **409 `GAME_ABANDONED`**.
- **Seat palette on the board.** The Saint Petersburg board now consumes the `colors` prop (it ignored it
  before — the real gap behind "colours reflected"): each player panel shows a `seat-legend-<id>` swatch
  with `data-color`, picked colour or seat-index fallback, matching the Can't Stop / Stone Age pattern.
- **`describe(move)` audit.** Every logged action type renders a sensible feed line
  (BUY / ADD_TO_HAND / PLAY_FROM_HAND / PASS incl. its phase-close & round-rollover & pub-pending variants /
  PUB_BUY / OBSERVATORY_DRAW / OBSERVATORY_RESOLVE); the `type.toLowerCase()` fallthrough is **unreachable**
  — the full-game REST test's `KNOWN_TYPES` assertion proves the logged-type set is exactly those seven, so
  nothing reaches the feed as a raw type. (No UI unit test: the UI package has no vitest harness and the
  other three games keep `describe` inline in their board with e2e feed coverage — matched here.)
- **Sweep.** A cheap **legalActions⊆applyAction fuzz** (`tests/fuzz.test.ts`, 2/3/4p × 5 seeds) applies
  *every* offered action at every step of a full game and asserts none throw (and each game ends) — the
  honest check that no illegal move is ever advertised. `mapError` needs no fix (its `: 409` catch-all
  covers every code; the mapping test enumerates them). UI affordances are all gated on `canDrive`
  (`acting = canDrive && !interlude && !ended`, and every `do*` handler guards). Two stale future-tense
  seam comments corrected (applyAction "arrive in SP4"; the UI client "action loop lands in SP1").
- **Verified green:** engine **509 @ 100%**, bot 157 (untouched), backend **232**, e2e **142**, typecheck
  clean, visual baselines untouched.

### SP8 — Art & board polish ✅ *(moved ahead of the bot, owner call 2026-07-22: playability before bots)*
The comps-on-artifact flow (like Morning Valley / the parchment chart): a proper board with the two
rows, stack/phase indicator, grouped play areas, hand fans. Original art only.

Owner-requested scope (2026-07-22), comped before porting:
- **Card iconography**: kind identity as color banding (green/blue/orange, tri-color for trading),
  **ware symbols as real icons on the green pairs** (they gate displacement legality, so visual =
  rules clarity), coin-vs-shield income/point marks, and effective-cost badges. Original glyphs on
  the repo's 24×24 convention — no reproduction of the published cards.
- **Player tableaus**: the platform's detailed-vs-compact split (the Stone Age `PlayerPanel` /
  Container mat pattern) — the viewer's own seat gets a full tableau (play area grouped by kind with
  per-phase income/point summaries, hand as cards), opponents collapse to one-line rows (tableau
  counts per kind, hand count, public score). Seat colors throughout.

**What shipped (SP8):** the **"Malachite & Gilt"** direction, approved on the comps artifact (rev 2 —
three directions comped; the owner chose C with two glyph revisions — fur = splayed skinned-pelt,
wool = rough ball of yarn — and the row ruling below). All diegetic art is **hardcoded-color original
SVG** (no dark-mode re-theme — the Scene/Chart rule); engine and backend untouched.

- **`art/` primitives** (work package ①): `icons.tsx` (the five 24×24 ware glyphs + `CoinMark`
  income / `ShieldMark` points / the Czar's `AnyWareRosette` "any green may displace"),
  `CardFace.tsx` (kind header band — trading = three **stacked** tri-color strips — effective-cost
  badge with the printed cost struck, ware glyph, abstract per-kind vignette, coin/shield marks),
  `Salon.tsx` (`MalachiteBoard` stretch-safe backdrop, `GiltRail`, `StackCabinet`, `PhaseMedallion`).
- **Board integration** (work package ②): `Board.tsx` 760 → 362 lines (orchestration only) + new
  `CardRow.tsx` (the salon surface — **upper row left-aligned, lower row right-aligned**, the owner's
  rev-2 ruling: the rows pull apart as the round ages, echoing pg. 5's "slide the remaining cards to
  the right"), `PlayerPanel.tsx` (the tableau split), `Results.tsx`, `feed.ts`. Every card renders as
  a `CardFace`; buy/hand/displace/pub/observatory affordances keep their testids and `canDrive`
  gating. Chrome sitting on the malachite uses the art's cream/gilt tones (owner fix folded in: the
  "+ Hand" affordance brightened to the cream family — the muted token had no contrast on the stone).
- **Tableaus (owner ruling):** all players always listed — the viewer's own seat(s) expanded (three
  tinted kind columns with phase-pay chips, the aristocrat column priced from the engine's
  `ARISTOCRAT_SCORE` export, hand as a fan of faces); opponents as compact rows (🔒 rubles always —
  redaction is the rule) that **expand read-only** via `sp-expand-<playerId>`.
- **Semantics kept beside the art:** the `sp-stack-<kind>`/`sp-discard` "N left" counts ride as
  `sr-only` spans under the `StackCabinet` visual, and the `sp-phase-<phase>`/`aria-current` pill
  track stays as the semantic layer beside the `PhaseMedallion` — screen-reader parity without
  duplicate visible numbers.
- **Verified green:** typecheck clean; UI build (the board stays a lazy chunk, 53 kB); SP + platform
  + architecture e2e 26/26; full e2e 141 passed plus one **pre-existing** environmental failure
  (Stone Age mobile visual on the bare dev box — fails identically on a clean tree; baselines are
  container-generated and CI's pinned-container e2e is the enforcement environment). No visual
  baselines regenerated; Saint Petersburg deliberately has **no** visual baseline (its board deal is
  rng-dependent at start, unlike the deterministic Container/Stone Age snapshots).

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
