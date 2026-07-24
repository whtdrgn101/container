# Roadmap — Russian Railroads (Ultimate Railroads)

The per-game roadmap for **Russian Railroads** (Ultimate Railroads big-box edition, Hans im Glück
2021), game 5 — and **the Track D pilot**: the first game built as an in-workspace **package**
(`packages/games/russianrailroads/`, the four-subpath shape from
[`docs/track-d-externalize-games.md`](../../../docs/track-d-externalize-games.md)) rather than four
folders across four packages. Owner decision 2026-07-24: the compressed path — **RR0 = Track D0**.

Rulebook: `reference_materials/ultimate_railroads_rulebook-v2_en.pdf` (48 pp — core rules pp. 4–23,
expansions pp. 24–45, special cases pp. 46–48). **Read the cited page before implementing a
mechanic**; the full rules digest (with the platform-seam audit) lives in the coordinator session
notes and its citations are repeated per-slice below. **The engine coverage gate is 100%.**

## The game, in one paragraph

A 2–4 player worker-placement / track-advancement / engine-building Euro over **7 rounds** (6 at
2–3p, pg. 22–23). Each turn: place worker(s) on an unoccupied shared action space and resolve it
fully, or pass (pg. 7). The dominant actions push **track markers** along your three private routes
(five ascending colors, wood→green→bronze→silver→gold, no leapfrogging — pg. 8–9), buy
**locomotives** whose number gates how much of a route scores (with cascading upgrade chains,
pg. 10–11), advance an **industry track** whose gaps are filled by **factories** (flipped
locomotives, pg. 11–13), and hire **engineers** — private reusable actions from a strip that slides
one space right each round (pg. 15–16). **Scoring runs every round** (routes by the valuation tile —
including empty spaces behind a track — plus industry, pg. 20–21); final scoring adds secret
**end-bonus cards** and the **engineer majority** (40/20, pg. 22). Most points wins; ties share.

## Why this game (platform notes — from the rules digest)

- **The hidden-info story is small and precise:** the ONE per-player secret is the held **end-bonus
  card** (pg. 22); everything else on the table is public. Plus shared face-down **stack orders**
  (end-bonus pile; expansion stacks) — redact as counts, the SA15/SP convention. `viewFor` from day
  one, but far simpler than Saint Petersburg's.
- **Randomness splits cleanly:** all base-game shuffles are **setup-only** (`createGame({rng})`:
  turn-order deal, engineer A/B stacks, end-bonus pile with 2 removed unseen — pg. 5). Mid-game
  randomness arrives only with expansions (Coal/Manufactory reveals) → the `ModuleContext.rng`
  server-action pattern when we get there.
- **The `legalActions` hazard is combinatorial moves,** not hidden info: a track-extension action
  distributes N steps across 3 routes × 5 ordered colors (digest §3.4). Binding design decision
  below.
- **One true interrupt** exists — American Railroads' "general payout" (pg. 31–32), an out-of-turn
  all-players resolution. Expansion scope; the coordination-state pattern (Container's auction) is
  waiting for it.

## Binding design decisions (made at slicing, 2026-07-24)

- **Package shape from day one.** One workspace package exporting `./engine`, `./module`,
  `./client`, `./bot`; registered via one `games.config.ts` entry (RR0's codegen). Every "add a
  game" touchpoint this build still needs by hand is a Track D finding — log them in this file as
  they surface.
- **Multi-step choices are engine locks, not atomic mega-actions.** Track extension, locomotive
  upgrade chains, and any "move N spaces split freely" benefit resolve as a **sequence of
  single-step actions under a pending lock** (`pendingMoves: { remaining, constraint }` — the
  Stone Age `pendingGather` / SP `pendingDraw` pattern). `legalActions` then enumerates single
  placements (small, exact) instead of every N-step distribution (exponential). The engine stays
  fully parameterized and fuzzable; the UI gets click-per-step interaction for free; bots rank one
  step at a time.
- **Locomotives and factories are ONE component pool** (a factory is a flipped locomotive, pg. 11)
  — one supply model with per-number stacks + a returned-factory pool, never two lists to keep in
  step.
- **Indirect actions are a per-turn action pool** (engineers, factory triggers — pg. 7): resolvable
  in any order, partially, never saved across turns. A first-class state field from RR1, since three
  later slices hang off it.
- **Rulebook gaps resolve by reading component art** (the SP0 600-DPI precedent), each ruling
  documented here: (1) silver/gold valuation-tile values (pg. 20 shows green=1, bronze=2, wood=0);
  (2) scoring-track overflow via point tiles (pg. 4/6, art only); (3) "choose an end bonus card"
  (pg. 46) — **AMBIGUOUS** draw-top vs pick; interacts with redaction; ruling due in RR8.
- **Solo "Emil" (pg. 44–45) is out of scope** — the platform's own bots are the solo story.

## The build plan — vertical slices

### RR0 — Platform prep (= Track D0) 🔄 *(in progress)*
`@game-hub/kernel` extracted as a workspace package (engine kernel + the GameModule/GameClient
contracts, compat re-exports everywhere); `games.config.ts` + checked-in registry codegen with a CI
freshness check; Tailwind `@source` for `packages/games/**`; `architecture.spec` driven by the
config. Pure refactor — all four existing games untouched, every suite green.

### RR1 — Package bootstrap + the worker-placement spine
The first `games.config.ts`-registered **package**: state shape (players: workers/coins/routes/
locos/industry/engineers/action-pool/end-bonus slot; shared: action-space occupancy, engineer strip,
supplies, turn order, round), `createGame({rng})` with the pg. 4–6 setup (turn-order deal, engineer
A/B stacks + 7-slot strip, end-bonus pile minus 2 unseen, wood tracks on space 1, 5 workers + 1
coin, #1 loco), **redacting `viewFor` from day one** (opponent end-bonus → held-count; pile → count),
the turn loop (place-on-unoccupied + resolve-fully or pass, occupied = worker OR coin, pg. 7),
coins-as-workers (pg. 14), pass → round end skeleton (workers/coins return, strip slides, pg. 21–22),
7/6 rounds by count (pg. 22–23). Two placeholder actions (take-2-coins, the reusable bottom
track space as a stub). Read-only board; engine 100%; coexistence + wire-redaction tests. *(Simple
dealt turn order this slice; the full track is RR6.)*

### RR2 — Track extension (wood) + per-round scoring
The game's "produce" (digest §5): the track-extension action spaces (incl. the coin+worker space and
the never-occupied bottom space, pg. 9), single-step moves under the **pending-moves lock**, empty-
space/no-leapfrog/route-end rules (pg. 9), then the **scoring phase** (pg. 20–21): per-route
valuation (wood=0 baseline; "empty spaces behind" rule), industry stub, scoring marker + point-tile
overflow (art ruling #2). A full multi-round wood-only game loops and scores.

### RR3 — The color ladder + doublers
Unlock thresholds (Trans-Siberian 2/6/10/15 → green/bronze/silver/gold, pg. 8–9), strict build
order, per-route color availability (5/4/3), valuation-tile values for silver/gold (art ruling #1),
**doubler tiles** (left-to-right above the route, supply-limited, pg. 14), temp workers (pg. 15).

### RR4 — Locomotives
Lowest-available acquisition, route capacity (2/1/1), reach-gates-scoring (pg. 10), **upgrade
chains as a pending-placement lock** (displaced locos cascade; can stop anytime; forced
flip-to-factory only when no empty loco space remains, pg. 10–11), the #10 double-stack rule.

### RR5 — Industry: factories + the wrench
The shared loco/factory pool flips (pg. 11–12), left-to-right gap filling + replacement rules,
the 5-gap industry track, wrench movement + the three industrialization spaces (pg. 13–14),
**factory indirect actions into the action pool** (pg. 13), industry scoring incl. the
on-a-factory-score-previous rule (pg. 21).

### RR6 — Player-board specials + turn order
(a) Route special spaces (pg. 18–19): wood-track prerequisites (persist across upgrades), keys, new
workers, route doubling, cumulative bonus stars, idea-token spaces + the 9 tokens / 5 idea cards
(pg. 46–47, incl. second wrench + revaluation flip). (b) The **turn-order track** (pg. 16–17): pass
scores the card's reverse, the two claim spaces + rearrangement, the **between-round worker-reuse
mini-phase** (2nd then 1st, 1-worker spaces only), starting-bonus setup cards (pg. 6).

### RR7 — Engineers
Hire-for-a-coin (one per round), the two public variable-action spaces, the sliding strip +
rounds-remaining display, private indirect actions via the pool, unclaimed-engineer removal
(pg. 15–16, 22).

### RR8 — Game end + final scoring + hardening
Last-round tile (pg. 22), end-bonus reveal + scoring (pg. 47; **ambiguity ruling #3 lands here**),
engineer majority 40/20 with highest-number tiebreak, shared ties (pg. 23). Then the SP7-style
hardening pass: full seeded 2/3/4p games over REST touching every mechanic, five-games-coexist,
`legalActions⊆applyAction` fuzz (the pending-lock design earns its keep here), version/log audits.
**Base game complete.**

### RR9 — Art & board polish
The comps-on-artifact flow (Morning Valley / malachite precedent): the player board's three routes +
track colors are the identity; original art only.

### RR10 — Bot
Greedy baseline from the (barely-)redacted view; the pending-lock design means it ranks single
steps. pg.-7 strategy notes as seed heuristics; benchmark-harness calibration (the CS4 convention).

### Expansion modules (post-base, in invasiveness order — digest §4)

| # | Module | Rating | Notes |
|---|--------|--------|-------|
| RR-M1 | Additional Engineers (pg. 43) | additive | 9 engineers into the A/B stacks |
| RR-M2 | Special Ideas (pg. 43) | additive | 5 special idea cards + freight car + special factory |
| RR-M3 | German Railroads (pg. 24–27) | moderate | new board: route switch (Hamburg/Berlin), extension tiles, income ovals, special valuation tile |
| RR-M4 | Coal Module (pg. 38–41) | moderate | coal economy, boilermen (+1 loco), **first mid-game rng reveals**; −1 round |
| RR-M5 | Manufactory Train (pg. 42) | moderate | follow-along resolution for all players; mid-game reveals; −1 round |
| RR-M6 | Asian Railroads (pg. 33–37) | invasive | shared industry board, maintenance cars, Osaka upgrade |
| RR-M7 | American Railroads (pg. 28–32) | invasive | dual industry, stocks board, **the general-payout interrupt**, boulders, golden spike |

Module boards (German/Asian/American) are **player-board variants selected at game creation** —
model as a `createGame` option per module from the start of RR-M3 design, not four game ids.

## Scope notes

- 2/3-player differences (pg. 23): 6 rounds, 6 engineers (3A/3B), per-count board sides — land with
  the mechanic each touches, not as a variant afterthought (the SA14 lesson).
- The Track D findings log (touchpoints this package build still needed by hand) lives here; feed it
  back into `docs/track-d-externalize-games.md` before any D2 decision.
