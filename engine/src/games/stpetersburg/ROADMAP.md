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

### SP0 — Bootstrap
Registered, creatable, viewable fourth game beside the other three. State shape (players: rubles,
play area grouped worker/building/aristocrat, hand; board: upper/lower rows, four stacks, discard
count; round, phase, per-phase starting players, consecutive-pass count), `createGame` (25 rubles,
shuffled stacks from `rng`, marker deal, seed the upper row with workers — **8/6/4 by player count**,
pg. 2 & 8), **redacting `viewFor` from the start** (opponent hands → count, rubles → hidden, stacks →
counts). Inert `applyAction` (`NOT_IMPLEMENTED`), module registered (palette + seat bounds 2–4),
read-only UI board, landing blurb/rules. Engine 100%; backend coexistence suite; e2e picks it.

### SP1 — The phase spine: buy, pass, score, refill
The action loop (pg. 3): `BUY {row, index}` and `PASS`, turn order from the phase's starting player,
actions end on all-pass-consecutively. Buying (pg. 3, 6): pay cost with **cumulative reductions** —
−1 per same-named card owned, −1 from the lower row, (smelter/workshop hooks land with their cards) —
**minimum 1 ruble**, card into the play area grouped by type. Phase **scoring** (pg. 4): every card of
the phase's type pays its money/points. **Refill** (pg. 4): upper row from the *next* stack to 8 total
on board. The worker phase is playable end-to-end and rests at the building phase.

### SP2 — Full round loop + trading-phase frame
Building and aristocrat phases (same machine), the no-scoring trading phase (pg. 5), and the round
transition (pg. 5): discard the lower row, slide upper → lower, refill workers to 8, rotate all four
markers left, next round. The pg. 8 special case (nobody takes a card → no refill, but stacks still
turn) included. A full multi-round game loops (no end trigger yet).

### SP3 — The hand
`ADD_TO_HAND {row, index}` (free, limit 3 — pg. 3) and `PLAY_FROM_HAND {index}` (pay full cost with
reductions, min 1). Redaction proof: backend test that an opponent's view never contains hand
contents, only the count (the §B1-style wire test). UI: your hand as cards, opponents as face-down
count.

### SP4 — Trading cards
`BUY`/`PLAY_FROM_HAND` of a trading card requires a displacement target (pg. 7): same color; green
needs matching ware symbols (five fixed pairs); blue displaces any building, orange any aristocrat;
trading cards never displace trading cards; Czar Peter displaceable by any green. Cost = difference,
**min 1**; displaced card discarded. The full 30-card trading deck data (pg. 9–10 card sheet).

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

### SP8 — Bot
Last, once the game is winnable. The first bot deciding from a **redacted** view (no opponent rubles or
hands): value cards by payback horizon (the pg. 8 tips are the seed heuristics — 2 workers early,
expensive cards have better ratios, keep trading-phase money), hand-speculation risk (−5), displacement
chains. Self-play 2–4p seeded; strength benchmark per the calibrate-then-commit convention (baseline: a
frozen greedy first cut, the Stone Age pattern).

### SP9 — Art & board polish
The comps-on-artifact flow (like Morning Valley / the parchment chart): a proper board with the two
rows, stack/phase indicator, grouped play areas, hand fans. Original art only.

## Scope notes

- 2–3 player differences are **only** the initial worker seeding and marker deal (pg. 8) — land them in
  SP0/SP1, not as a later variant.
- The card sheet (pp. 9–10) is the authoritative card list (names, costs, incomes, counts). Encode it
  once as deck data with a test asserting the printed totals (31/28/27/30, pg. 1).
