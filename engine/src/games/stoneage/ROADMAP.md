# Roadmap — Stone Age

The per-game roadmap for **Stone Age**, tracked across every layer: engine
(`engine/src/games/stoneage/`), backend module (`backend/src/games/stoneage/`), UI client
(`ui/src/games/stoneage/`), and — last — its bot. Platform/engine-wide work lives in the top-level
[`ROADMAP.md`](../../../../ROADMAP.md).

Rulebook: `reference_materials/Stone_Age_-_Rules_-_Bernd_Brunnhofer.pdf`. **Read the relevant page before
implementing a mechanic** — cite it in a comment. **The engine coverage gate is 100%.**

## The game, in one paragraph

A 2–4 player **worker-placement** Euro (Bernd Brunnhofer, 2008). Each round has three phases: players
take turns **placing** their people on the board's places; then each player **uses** their placed
people's actions (gather wood/brick/stone/gold or food by rolling dice — tools boost the total — or
make tools, grow population, raise food production, or buy buildings and civilization cards); then
everyone **feeds** their people (1 food each, or lose points). The game ends when the civilization-card
deck can't refill the display or a building stack runs out; the most points wins. Almost no hidden
information — a good contrast to Container.

## The build plan — one stage per action

Stone Age is much bigger than Can't Stop, so it's sliced by **action**, each a green, demoable stage
that adds one place's mechanic (or one phase). The **AI bot is the last stage**, once every action
exists and the game can be won. Dice actions inject randomness the same way Can't Stop does
(`ModuleContext.rng` + a server-side roll route); the card/building decks shuffle at `createGame` (like
Container's scoring deck).

### ✅ SA0 — Bootstrap (shipped)

A registered, creatable, viewable third game, coexisting with Container and Can't Stop — the platform
proof, and the foundation the mechanics slot into.

- **Engine** (`engine/src/games/stoneage/`, 100% coverage): the state shape (players with people/food/
  food-track/tools/resources/cards/buildings/score; the eight board places as `playerId → count`
  placements; round/phase/turn), `createGame` (the pg. 2–3 starting setup: 5 people, 12 food, empty
  board), a near-identity `viewFor`. **Deliberately inert** — `legalActions` is empty and `applyAction`
  refuses every move (`NOT_IMPLEMENTED`), so the pipeline (turn checks, error mapping) is real from day
  one while the mechanics are stubbed. The `Action` union is seeded with `PLACE` to compile against.
- **Backend module** (`backend/src/games/stoneage/`): a registered `GameModule`; `parseAction` refuses
  everything for now; no dice route/bot yet.
- **UI** (`ui/src/games/stoneage/`): a **read-only** board rendering the setup (the eight places with
  capacities/yields, each player's holdings) + a "built one stage at a time" note; a `blurb`/`rules` on
  the landing. Registered in the picker.
- **Tests:** engine 100%; a backend suite (setup, coexistence, actions refused, seat bounds); an
  `e2e/stoneage.spec.ts` that picks it and renders the board.

### ✅ SA1 — Placement phase (shipped)

The worker-placement spine (pg. 4): on your turn place **1+ people on one place** (capacities —
toolMaker/field 1, hut 2, hunt unlimited, forest/clayPit/quarry/river up to 7 total), never on a place
you already used this round, and you must place while a legal place exists. Turn passes clockwise,
**skipping players who are out**, until nobody can place → the phase becomes `actions` and the start
player is up. Engine: the `PLACE` action + `internal/placement.ts` (`countRange`, `canPlace`,
`nextPlacer`, `legalPlacements`), 100% covered. Backend `parseAction` accepts `PLACE`; the UI board is
interactive — each place shows its occupancy and a Place button (a count stepper on the variable
places). A full placement round is playable end-to-end (it then rests at the action phase until SA2).
*(Deferred: the 2–3-player place restrictions on pg. 8 — SA1 uses the 4-player capacities for all
counts.)*

### ✅ SA2 — Resource procurement + the dice engine (shipped)

The action phase (pg. 6): the start player uses **all** their placed people, then the next player
clockwise (`internal/actionsPhase.ts` — `enterActionPhase`, `advanceActor`; a player's turn ends when
they've no resource places left, returning their people, → the next gatherer or → feeding). The first
action: **forest / clay pit / quarry / river** — the `GATHER` action rolls one die per person, sums
them, and takes 1 resource per "full N" (wood 3 / brick 4 / stone 5 / gold 6). **Server-side dice**: a
`POST /games/:id/stoneage/roll { playerId, place }` route rolls from `ctx.rng` and applies `GATHER`
(server-only — `parseAction` refuses it), exactly Can't Stop's pattern. UI: a **Gather** button on your
resource places + a move log showing each roll. 100% engine coverage; a full round (place → gather) is
playable, resting at the feeding phase until SA7.
*(Tools — which add to the roll — arrive with SA4, since you can't own any yet. The same dice engine
will serve the hunt in SA3.)*

### ✅ SA3 — Hunt (shipped)

Reuses SA2's dice engine (pg. 6): the `GATHER` action now also resolves the **hunt** — roll one die per
hunter, take 1 **food** per "full 2". Unifying it took only a branch in `gather` (food vs. resource, a
`{ place, dice, amount, kind }` log payload) and generalizing the action-phase "actionable" check to
gather places (`hasActionablePlacements` = resource places + hunt). The roll route and the UI's Gather
button light up on the hunt for free. 100% engine coverage. *(Tools still arrive with SA4.)*

### ✅ SA4–6 — The non-dice places: tool maker / hut / field (shipped)

The three "instant benefit" places (pg. 5–6) all resolve through **one** action, `USE { place }`, since
none of them rolls dice: the person is returned and the benefit applied. Engine (`actions/use.ts`,
`internal/tools.ts`, 100% covered):

- **SA4 · Tool maker (pg. 5):** take 1 tool via the tool ladder (`addTool`) — your 1st–3rd tools are
  value 1; the 4th–6th upgrade the lowest value-1 to 2, 7th–9th to 3, 10th–12th to 4 (capped at 3 tools
  held). *(Spending tools to boost a gather roll is deferred — see notes; tools also don't yet reset per
  round until SA8.)*
- **SA5 · Hut (pg. 6):** gain 1 person from the supply.
- **SA6 · Field (pg. 6):** move up the food track (+1 food produced each round end).

The action-phase "actionable" check now covers **every** place (`hasActionablePlacements = PLACES.some`),
so a placed tool maker/hut/field is used rather than silently skipped — the bug where placing on the
field did nothing. `legalActions` lists the `USE` options in the action phase; `parseAction` accepts
`USE` (still refusing the server-only `GATHER`). UI: a labeled button per place (**Take tool** / **Grow
+1** / **Field +1**) beside the Gather buttons, gated on `canDrive`. Backend + e2e cover the field
raising food production. A full place → gather/use round is playable, resting at feeding until SA7.

### ✅ SA7–8 — Feeding + round transition: a full playable round loop (shipped)

The round now closes and rolls over (pg. 7). Both landed together since feeding *is* the trigger for the
new round. Engine (`actions/feed.ts`, `internal/feeding.ts`, 100% covered):

- **SA7 · Feeding (pg. 7):** the `FEED` action — take the field's food-track production first, then pay
  1 food per person. A shortfall may be covered with resources (1 food each, **least valuable spent
  first** so the pricier ones survive for scoring — `payWithResources`, default true); declining or being
  unable loses **all** food and costs **−10 points** (clamped at 0). Feeding is sequential in start-player
  order; `legalActions` offers `FEED` in the feeding phase and `parseAction` accepts it (not server-only —
  no dice).
- **SA8 · Round transition (pg. 7, "New round"):** once the last player feeds, `advanceFeeder` →
  `startNewRound`: pass the start-player marker one seat left, clear the board, bump the round, and return
  to placement with the new start player up.

UI: a **feed panel** in the feeding phase showing need vs. food on hand, with **Feed people** (no
shortfall), **Pay N resources** / **Take −10** (short but able), or just **Take −10** (can't cover),
gated on `canDrive`; the move log narrates each feed. Backend + e2e play a full round and assert it rolls
into round 2. **Stone Age is now a playable multi-round loop** (minus buildings/cards).

*(Deferred to their stages: the hunt's once-per-round limit — placements already clear each round; the
hand-picked resource spend at feeding — auto lowest-value-first for now.)*

### ✅ SA4b — Spending tools on a gather roll (shipped)

Tools finally do something (pg. 5–6): a gather is now **two steps** — roll, then take, adding tools in
between. The engine holds the rolled dice as a `pendingGather` on the state so they stay
server-authoritative across the two calls (the same "roll is data" discipline, just split): the
server-only `GATHER` route sets it; the client's `TAKE_GATHER { toolIndices }` adds the chosen tools to
the total, takes the yield, and clears it. While a roll is pending the turn is **locked** to taking it
(`GATHER_PENDING`), mirrored in the UI. Each tool is **once per round** — `StoneAgePlayer.toolsUsed`
(parallel to `tools`) tracks spent tiles, and **SA8's round transition now flips them all back** (the
reset that was waiting on this). New tools from the tool maker start unused; an upgraded tile keeps its
state. UI: a **gather panel below the board** shows the dice, the running total, your tools as toggle
chips (used ones greyed), and a live yield preview → **Take**. 100% engine coverage; backend + e2e prove
a tool turns an 8 into a 9 (2 wood → 3).

### ✅ SA9 — Buildings (shipped)

Buildings are **placement targets** (pg. 5): each stack's revealed top tile is a slot that holds exactly
1 person, filled during the placement phase; in the action phase that person **buys** the tile (pay its
resources → score their combined value immediately → reveal the next tile) or **declines** (empty
payment → take the person back, leave the tile). The deck is `playerCount` face-down stacks of 7,
**shuffled at `createGame`** (setup step 9) — which is why `createGame` now takes the injected `rng`.

- **Engine** (100% covered): the placement model gained **dynamic building slots** — `PlaceId` now
  includes `building1..4`, `PLACES` stays the 8 fixed places, and the internal bookkeeping
  (`placedBy`/`clearPlayer`/`hasActionable`/`canPlace`) iterates `ALL_PLACES`. `countRange` gates a
  building slot on its stack being non-empty. The three cost kinds live in `internal/buildings.ts`
  (`buildingPaymentError` + `paymentValue`): **fixed** (exact resources), **choice** (exactly N from
  exactly K kinds — 8 tiles), **any** (a `min..max` total — 3 tiles). The `BUILD { stack, resources }`
  action pays or (empty) declines. The tile deck (`BUILDING_DECK`, 17 fixed + 8 choice + 3 any) is a
  faithful **adaptation** — the rulebook doesn't print every fixed cost, same discipline as Container's
  scoring-card deck.
- **Backend**: `parseAction` accepts `BUILD` (and `PLACE` on a `building*` slot — validated against
  `ALL_PLACES`); `createGame` passes `ctx.rng` to the shuffle. A REST test buys a building for its exact
  points and rejects the no-person / malformed cases.
- **UI**: a **Buildings** row shows each stack's top tile + cost; a **Place worker** button in placement,
  and in the action phase a per-resource payment picker with a live `+N pts` readout gated on
  `buildingPaymentError`, plus **Build** / **Pass**. The move log narrates buys and passes.
- **Bug caught by the e2e**: the round-transition `emptyPlacements()` rebuilt only the 8 fixed places,
  dropping the building slots and breaking round 2 — fixed to use `ALL_PLACES`, with a regression test.

*(Deferred: an emptied stack as a **game-end trigger** — wired in SA11; the 2–3-player building rules are
unchanged.)*

### ✅ SA10a — Civilization cards: acquisition + immediate effects (shipped)

Cards are **placement targets** like buildings (pg. 4, 6): each of the 4 display slots holds one worker,
and in the action phase that worker **acquires** the card — pay its position cost, take it (immediate
effect fires, kept for scoring), empty the slot — or **passes** (empty payment). Closely mirrors SA9.

- **Engine** (100% covered): `PlaceId` gained `card1..4`; `internal/cards.ts` holds the deal/refill and
  `cardPaymentError` (a card costs a *number* of resources — `CARD_COST` = position, **any kinds, never
  food**) + `applyCardEffect`. `ACQUIRE_CARD { slot, resources }` acquires or (empty) declines. State
  gained `cardDisplay` (4 slots) + `cardDeck`; **`createGame` shuffles + deals 4** and the **round
  transition refills** (slide kept cards left to the cheap end, draw into the empty slots — pg. 7). The
  deck (`CIV_CARD_DECK`, 36 cards: 24 green culture across 8 symbols + 12 sand multipliers) is a faithful
  **adaptation** — the rulebook points to a separate info sheet. Immediate effects modeled:
  resource / food / food-track / tool / points / none.
- **Backend**: `parseAction` accepts `ACQUIRE_CARD`; a REST test buys a card for its slot cost and
  applies the effect.
- **UI**: a **Civilization cards** row (own component `CardRow.tsx`, to keep `Board.tsx` small) shows each
  slot's cost, immediate effect, and scoring symbol; a **Place worker** button, and an action-phase
  resource picker gated on `cardPaymentError` → **Take** / **Pass**.

*(Deferred: **SA10b** — final scoring by the cards' `scoring` data (green symbols² + sand multipliers),
which folds into SA11; and the fancy card types — roll-and-share, choose-later. Deck-can't-refill as a
**game-end trigger** is wired in SA11.)*

### ✅ SA11 — Game end + final scoring: the core game is complete (shipped)

Stone Age is now **winnable end-to-end** (pg. 8). Both game-end triggers resolve at the round transition
(`startNewRound`, after the round's feeding): a **building stack is empty** (played to the end) or the
**card deck can't refill** the display. Either ends the game with final scoring and no new round.

- **Engine** (100% covered): `internal/scoring.ts` — `scorePlayer` adds to the points banked during the
  game (buildings, card `points` effects, feeding penalties): green culture cards score **distinct
  symbols²**, the four sand multipliers score farmers×food-track / tool-makers×tool-value /
  hut-builders×buildings / shamen×people, and each leftover **resource** is +1 (food doesn't score).
  `finalScoring` ranks players and picks the winner by total, then the **food-track + tools + people**
  tiebreak, sharing if still level. State gained `results` (a per-player `ScoreBreakdown`) alongside
  `winnerIds`; `status` flips to `'ended'`.
- **UI**: when `status === 'ended'` the board renders the shared **`GameOver`** frame with a scoreboard
  breaking out each scoring line (cards² / farm / tools / build / shaman / res / total), sorted, winner
  crowned — the same ending every game gets, plus rematch.
- **Not integration-tested over REST**: reaching an end trigger takes ~15 rounds of moves, so the engine
  tests are authoritative for scoring + triggers; the backend just passes `status`/`results` through
  `viewFor`, and the results screen reuses the `GameOver` pattern container/cantstop already e2e-cover.

🎉 **The core Stone Age game is complete** — place → gather (with tools) / actions / buildings / cards →
feed → round loop → game end + scoring, at 100% engine coverage. Remaining is additive: the AI bot
(SA12) and polish (SA13).

### SA12 — AI bot  · **L** · after the game is winnable

The last stage (as planned): a worker-placement bot in `bot/src/games/stoneage/` and a backend
`createBotDriver`, so Stone Age gets AI seats and the platform's 🤖 toggles for free. Stone Age's low
hidden information makes valuation tractable; the hard part is the multi-phase turn (place, then order
your actions well). 90% coverage gate + self-play, like the other bots.

### Later (optional)

- **SA13 — Visual & a11y polish:** original art for resources/people/board, motion, a proper board
  layout (match Container's Slice 8 / Can't Stop's CS2 bar).
- **2–3-player rules** (pg. 8): restrict tool-maker/hut/field to 2 of 3, and the resource places' player
  counts — if not folded into SA1.

## Notes / scope

- **Two randomness sources:** the card/building shuffle at `createGame` (via the injected rng, like
  Container) and per-turn dice (via `ModuleContext.rng` + a roll route, like Can't Stop). The engine
  stays pure — dice arrive as data on a roll action.
- **Low hidden information:** only the undrawn decks are secret. `viewFor` is near-identity today; redact
  the deck order in SA9/SA10 if it ever matters.
- **The state grows per stage** — add fields (`buildings`, `pendingGather`, `toolsUsed`, later the card
  display) when their stage needs them, exactly as Container's state did across its slices.
