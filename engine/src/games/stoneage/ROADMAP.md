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

### SA7 — Feeding phase  · **M** · pg. 7

After the action phase: each player gains food-track production, then pays 1 food per person. Shortfall
may be covered with resources (1 each) or costs **−10 points**. Phase transition out of the round.

### SA8 — Round transition  · **S** · pg. 7

Close the loop: rotate the start player left, clear placements, flip used tools back, reset the
hunt's once-per-round, advance the round. With SA1–SA7 this makes Stone Age a playable multi-round loop
(minus buildings/cards).

### SA9 — Buildings  · **M–L** · pg. 7 + setup pg. 3

The building tiles: `playerCount` face-down stacks of 7 (shuffled at `createGame`), top revealed. Pay
the shown resources → take the building → **immediate points** onto the scoring track → reveal the next.
Model the two flexible-cost building kinds (exactly-4-from-2-kinds, and 1–7-any, scored by resource
value). An emptied stack is a **game-end trigger** (feeds into SA11).

### SA10 — Civilization cards  · **L** (biggest) · pg. 6 + info sheet

The 36-card deck + 4-slot display (resupplied each round, right-to-left). Pay resources (position in
the row adds a cost) → take the card → its **immediate top effect** (instant resource/food/tool/points/
food-production; the roll-and-share dice cards; the choose-later cards; one-time tool cards) → keep it
for **final scoring** (green culture symbols vs. sand-colored multipliers). Worth splitting: **SA10a**
acquisition + immediate effects, **SA10b** the scoring data on the card backs. Deck-can't-refill is the
other **game-end trigger**.

### SA11 — Game end + final scoring  · **M** · pg. 8

End when the card deck can't fill the display (immediate) or a building stack is empty (finish the
round). Score: green cards **squared** (distinct-symbol count²), sand multipliers (farmers×food-track,
tool-makers×tool-value, hut-builders×buildings, shamen×people), +1 per leftover resource. Winner by
total, then food+tools+people tiebreak (pg. 8). `status: 'ended'` + `winnerIds` + a results screen in
the shared `GameOver`.

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
- **The state grows per stage** — add fields (building stacks, card display, per-place tool spend, dice
  awaiting a roll) when their stage needs them, exactly as Container's state did across its slices.
- **Deferred (SA4b) — spending tools on a gather roll (pg. 6).** Tools boost a gather total, but that
  needs a two-step roll (roll → optionally spend tools → finalize), so `GATHER` currently ignores tools.
  Fold it in when the gather flow gains that pending step; it also depends on SA8's per-round tool reset.
