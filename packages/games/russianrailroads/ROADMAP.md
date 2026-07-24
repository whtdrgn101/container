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
  documented here: (1) silver/gold valuation-tile values — **LANDED in RR2**: the pg. 20 tile art reads
  wood 0 / green 1 / bronze 2 / **silver 4 / gold 7**; (2) scoring-track overflow via point tiles —
  **LANDED in RR2**: track is a 1–100 loop, 100/300/500 point tiles (pg. 4), modelled as an unbounded
  integer score; (3) "choose an end bonus card" (pg. 46) — **AMBIGUOUS** draw-top vs pick; interacts with
  redaction; ruling due in RR8.
- **Solo "Emil" (pg. 44–45) is out of scope** — the platform's own bots are the solo story.

## The build plan — vertical slices

### RR0 — Platform prep (= Track D0) 🔄 *(in progress)*
`@game-hub/kernel` extracted as a workspace package (engine kernel + the GameModule/GameClient
contracts, compat re-exports everywhere); `games.config.ts` + checked-in registry codegen with a CI
freshness check; Tailwind `@source` for `packages/games/**`; `architecture.spec` driven by the
config. Pure refactor — all four existing games untouched, every suite green.

### RR1 — Package bootstrap + the worker-placement spine ✅ *(shipped)*
Shipped as `@game-hub/game-russianrailroads` — the first `games.config.ts`-registered **package** (four
subpath exports over TS source: `./engine`, `./module`, `./client`, `./bot`), added with one config
entry + `pnpm generate`. The **engine** (100% coverage, 44 tests) is the pg. 4–6 setup + the
`PLACE`/`PASS` turn loop: `createGame({rng})` deals the turn-order cards, the engineer A/B strip (7 slots
at 4p, 6 at 2–3p, left-most empty at 3p), the end-bonus pile (2 removed unseen), a wood track on space 1
of each route, the #1 loco, and per-count workers/coins/rounds; `place` occupies a space (worker OR coin,
pg. 14) with the bottom track space as the never-occupied stub (pg. 9, move deferred to RR2); `pass` is
round-terminal and, once all pass, closes the round (workers return, occupancy clears, engineer strip
slides right, round++ or the stub shared-result end at the round count). `viewFor` redacts from day one
(opponent end-bonus → held-count; pile → count), proven by a JSON wire test. The **module** (seat bounds
2–4, palette, `PLACE`/`PASS` `parseAction`, error map; no routes/pendingStep/bots, schemaVersion v1) and a
**read-only-ish client** (lazy board over the shared TurnBanner/ActivityFeed/GameOver, `canDrive`-gated)
round it out. Tests: backend coexistence extended to **five real games + the counter stub** in one app
(`module-seam`), a dedicated `russianrailroads.test.ts` (REST play + wire redaction), and
`e2e/russianrailroads.spec.ts` (pick → place → pass → feed). The **bot** subpath exists but is empty
(RR10). **Track D findings** logged below. *(Simple dealt turn order this slice; the full track is RR6.)*

<details><summary>RR1 planned scope (retained)</summary>

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

</details>

## Track D findings log — RR1

The design doc claims "adding a game = one entry in `games.config.ts` + `pnpm generate`." That's true for
**registration** (one `GameEntry` with package specifiers, then codegen). But shipping the first game *as a
package* over **TypeScript source** (not a built `dist`) still needed the hand-edits below. The recurring
theme: the doc's §2 ("externalization forces a real `dist`") is **not** done here — we consume the package
as source, like the engine — so every workspace assumption the doc says a `dist` would dissolve is *still
present*, just relocated from `engine/` to the new package. Feed this back into the doc before any D2
decision.

**Config/registration (the intended path — zero friction):**
- `games.config.ts` — one entry `{ id, module: '@game-hub/game-russianrailroads/module', client:
  '.../client' }`; `pnpm generate` wrote both registries correctly and idempotently. ✔

**Hand-edits still required (each a finding):**
1. **`pnpm-workspace.yaml`** — added `packages/games/*`. The existing `packages/*` glob does not reach a
   nested `packages/games/<game>/`, so pnpm never linked the package until this was added.
2. **`backend/package.json`** — added `"@game-hub/game-russianrailroads": "workspace:*"`. The generated
   backend registry `import`s `.../module`; without the dependency, tsx/node can't resolve it.
3. **`ui/package.json`** — same dependency, for the same reason (the generated UI registry imports
   `.../client`).
4. **`backend/vitest.config.ts`** — widened `server.deps.inline` from `/@game-hub\/(engine|bot|kernel)/`
   to include `game-`, so Vitest **transpiles** the TS-source game package instead of treating it as an
   external dep. A `dist`-shipping package would not need this — this is a direct consequence of shipping
   source.
5. **`ui/vite.config.ts`** — added **one alias per subpath** the UI consumes
   (`@game-hub/game-russianrailroads/client` → the source file), exactly the **touchpoint #2 duplication**
   the doc predicted a `dist` would kill. It persists for TS-source packages. (Only `/client` is needed —
   the client imports its own `./engine` via a relative path, so no `/engine` alias was required.)
6. **`ui/tsconfig.json`** — added the package's `src/client` dir to `include`. A game package **cannot
   fully typecheck its own client**: the client needs the shell's `@/*` path alias (for `@/lib/api`,
   `@/components/*`) plus React/DOM libs, which live in the UI's tsconfig, not the package's. So the
   package's own `tsconfig` covers only `engine`/`module`/`bot` (kernel-only deps), and the **UI host
   typechecks the client**. This is the sharpest finding: the client subpath is not self-contained.
7. **Package → UI coupling (no file edited, but a real dependency).** The client reaches into `ui/src`
   through the `@` alias — `@/lib/api` (the transport DTOs `GamePayload`/`GameMessage`) and the shared
   board chrome (`TurnBanner`/`ActivityFeed`/`GameOver`/`seatIdentity`). The kernel's `GameClient`/
   `BoardProps` **contract** is neutral (good — the package binds it in `client/types.ts`), but the
   **concrete transport types and shared components are UI-internal**. Until the shell exports them as a
   package a game can depend on, a game client is not truly decoupled from this repo's UI.
8. **Coexistence tests hard-code the game list.** Adding a game touched `backend/src/tests/module-seam.test.ts`
   (catalog + "all games at once") and the exact-catalog assertions in `stoneage.test.ts` /
   `stpetersburg.test.ts`. Expected (these are the *point* of a coexistence test), but worth noting the
   list isn't derived.

**Kernel-contract awkwardness (Track D signal for later slices):**
- The module is typed `GameModule<State, Action>` from `@game-hub/kernel` with the host generics left at
  their `unknown` defaults, and the generated `.register()` accepts it via **method bivariance** against
  the backend's bound `GameModule<unknown, unknown, ModuleContext, FastifyInstance>`. Works cleanly *for a
  module with no host hooks*. But **RR10's `createBotDriver(ctx: ModuleContext)` will want the backend's
  concrete `ModuleContext`** — which lives in `backend/src/games/module.ts`, not the kernel. A bot-having
  game package will need that bound context type exposed somewhere neutral, or it re-couples to the
  backend. The kernel exposes `ModuleContext<Db, Hub, BotSeats>` generically, so the package can't name
  the *concrete* one without the host. Flag for RR10 / any external pilot.

## Track D findings log — RR2

**No new hand-touchpoints.** RR2 added a whole mechanic (a new `MOVE_TRACK` action, the pending lock, the
scoring phase) entirely **inside** the package — engine, module `parseAction`, client — plus the package's
own backend REST test and its `e2e/` spec. It needed **zero** edits to any host file: no
`games.config.ts`, no registry regeneration (the codegen reported both registries unchanged), no
`vite.config.ts` / `tsconfig` / `package.json` / `vitest` changes. This is the encouraging half of the
Track D story: once a game package is *wired* (the RR1 findings), growing it is self-contained — the
per-slice cost lives where it should. (The standing RR1 findings — TS-source consumption, the client
typechecking via the UI host — are unchanged; nothing in RR2 touched them.)

### RR2 — Track extension (wood) + per-round scoring ✅ *(shipped)*
The game's "produce" (digest §5). Shipped: the track-extension action spaces (the 1-worker wood → **2**
moves and 2-worker wood → **3** moves spaces, the worker+coin → **2** moves space, and the never-occupied
bottom → **1** move wood/green space — move counts read off the pp. 4–5 board art and cross-checked
against the pg. 8 example); single-step `MOVE_TRACK` under the **pending-moves lock** (`state.pendingMoves
= { remaining, colors }`, the binding ruling); the empty-space/no-leapfrog/route-end rules (pg. 9); and the
**scoring phase** (pg. 20–21) at round close — per-route valuation (loco-reach-gated, "empty spaces behind"
rule, the full valuation tile), an industry stub (0, RR5), and cumulative per-player scores that drive the
end-game winner. Engine 100% (65 tests); a backend REST test drives the lock + scoring on the wire;
`e2e/russianrailroads.spec.ts` plays place → lock → clicks → pass-out → score. Rulings landed below.

**RR2 rulings (with evidence):**
- **Ruling #1 (valuation tile) — LANDED.** Read off the pg. 20 tile art at 400 DPI (confirmed on the pg. 6
  player board): **wood 0 / green 1 / bronze 2 / silver 4 / gold 7**. The rulebook prose only gives wood/
  green/bronze; silver = 4 and gold = 7 are the component read. Encoded in full now (`VALUATION`), so RR3's
  colour ladder needs no further art work here.
- **Ruling #2 (scoring-track overflow) — LANDED.** The physical track is a 1–100 loop with **100/300/500
  point tiles** beside space 100 (pg. 4 art). The engine models a player's score as **one unbounded
  integer**; the wrap is pure display (track position = `score % 100`, point tiles = `⌊score/100⌋`), so
  there is no wrapping logic to get wrong.
- **Lock-exhaustion ruling.** pg. 8–9 doesn't state what happens to unspent moves when no track can advance
  (all at the route end / blocked). Adopting the **Container Produce precedent** ("as many as you are able
  to"): the lock **auto-releases and forfeits** the remaining moves, and the turn passes. This covers both a
  placement that can't move at all (no lock is ever set) and a lock that runs dry mid-resolution.
- **Track-model ruling (relocate).** Each route holds **≤ 1 track tile per colour** at its frontier; a step
  **relocates** the tile one space forward, leaving the space behind empty (scored as that colour, pg. 20).
  This matches RR1's sparse `spaces` representation and the pg. 20 scoring example (sparse tiles + empty-
  behind). Loco **reach** = the **sum** of a route's loco numbers (pg. 20: #6 + #2 reach space 8); RR2's #1
  loco sits on the Trans-Siberian, so only that route reaches space 1.

**Scope deferred (as designed):** the dedicated green/bronze/silver/gold single-/double-worker spaces exist
on the board but wait for **RR3**'s colour access (`accessibleColors` is a stub returning `['wood']` — the
one seam RR3 fills). Adding those eight spaces now would be spaces nobody could place on. St. Petersburg's
×2 and Kyiv's star spaces (route-special scoring) are RR6; doublers are RR3; industry scoring is RR5.

### RR3 — The color ladder + doublers + temp workers ✅ *(shipped)*
The colour ladder made real. Shipped: the **unlock thresholds** (the wood track reaching Trans-Siberian
space 2/6/10/15 grants green/bronze/silver/gold access — computed, not stored); **per-route colour
availability** (Trans-Sib 5, St. Pete 4, Kyiv 3); the eight **dedicated colour action spaces** (green
1w→2/2w→3, bronze/silver/gold 1w→1/2w→2, read off the board); `MOVE_TRACK`'s **colour choice** de-stubbed
(the lock's `colors` constraint is real, a new colour **enters at space 1** then relocates forward, no
leapfrog); **doubler tiles** (1 worker → the leftmost Trans-Siberian doubler space, shared supply of 30,
doubles that space's points every round — the pg. 20 example); **temporary workers** (1 worker → the 2
turquoise workers, usable this round, returned at round end). Engine 100% (**85 tests**, +20 across new
`colorLadder`/`doubler`/`tempWorkers` files); a backend REST test drives a doubler + a colour unlock over
the wire; the client gained a colour picker (`rr-build-<route>-<colour>` on a multi-colour lock), doubler
badges, a temp-worker readout, and legal-move-gated action buttons; `e2e/russianrailroads.spec.ts` extended
with a green build after unlock. Rulings landed below. **Track D findings: none new** (self-contained
inside the package, like RR2 — no host file touched, registries unchanged).

**RR3 rulings (with evidence):**
- **Unlock trigger — LANDED (pg. 8–9).** "As soon as you reach or pass space N on your Trans-Siberian
  route [with your **wood** track] … take the X tracks." Thresholds green 2 / bronze 6 / silver 10 / gold
  15, gated on the **wood** frontier of the **Trans-Siberian** route (`UNLOCK_SPACE`). Access is **global**
  (buildable on any route that supports the colour) and **monotonic** (wood only advances). The unlock
  grants **access only** — the tracks go to supply; **no immediate free move** (verified pp. 8–9 grant no
  moves; the "new track" grant icons are access markers, not move spaces).
- **Colour-entry rule — LANDED (pg. 9 example + pg. 20).** A new colour **enters at space 1** as its first
  move, then relocates forward. Tracks are **not** in a fixed colour order along a route — pg. 9 shows green
  behind bronze, pg. 20 shows bronze behind green; the only positional rule is onto-empty-only / no-leapfrog
  (already in `canAdvance`). "Strict build order wood→green→bronze→silver→gold" (pg. 9) is the **access-tier**
  order, enforced automatically by the ascending thresholds — **not** a per-route positional constraint.
- **Per-route colours + supply reconciliation — LANDED (pg. 9 / board colour strips at 300 DPI).**
  Trans-Sib wood/green/bronze/silver/gold, St. Pete wood/green/bronze/silver, Kyiv wood/green/bronze. This
  **reconciles** the pg. 3 contents "12 tracks: 3×,3×,3×,2×,1×": each colour appears on exactly as many
  routes as it has tracks (wood/green/bronze ×3, silver ×2, gold ×1), so the per-player supply is **emergent**
  from route availability + the one-tile-per-colour-per-route model — **no separate supply count is stored**.
- **Trans-Siberian length = 15 — LANDED (pg. 6 board art).** Spaces 1–9 across the top, corner space 10,
  11–15 down the right edge — the length the gold threshold (space 15) needs. St. Pete/Kyiv kept at the RR2
  placeholders (7/8); the board reads 9/9, but exact non-Trans-Siberian lengths are RR6 and don't affect the
  ladder (which is gated on the Trans-Siberian). *(A latent bug avoided: at length 10 gold could never
  unlock.)*
- **Doubler spaces = 8 — LANDED (pg. 6, 14).** Eight doubler spaces above Trans-Siberian spaces 1–8, filled
  left-to-right, ≤1 per space, shared supply 30. A doubler over space _i_ doubles that space's scored points
  each round; the count persists across rounds (tiles stay on the board). Modelled as a per-player prefix
  count 0–8.
- **Temp workers — LANDED (pg. 15).** The 2 turquoise workers fold into `workersAvailable` for the round and
  a `tempWorkers` count; the round-end reset (`workersAvailable = workersTotal`, `tempWorkers = 0`) returns
  them. "Not the turn taken" is automatic — taking them is a normal `PLACE` that passes the turn. Only one
  holder at a time (the single action space is occupied once used).

**Scope deferred (as designed):** St. Petersburg's ×2 / Kyiv's star route-specials, the wood-prerequisite /
key / new-worker / bonus-star spaces along the routes, and exact St. Pete/Kyiv lengths are RR6; locomotives
RR4; industry (the doubler's cousin on the industry track) RR5.

### RR4 — Locomotives ✅ *(shipped)*
The engine-building spine (pg. 10–11). Shipped: the shared **locomotive/factory supply** (per-number
stacks #2–#9 + the two #10 stacks + a returned-factory pool — one model, because a factory is a flipped
loco); the two RR4 **locomotive action spaces** (1 worker / 2 workers, each acquiring the lowest-numbered
loco); **lowest-available acquisition** with the **#10 double-stack rule** (both #10 stacks open only once
#9 is empty); the **second engine lock** `pendingLoco`, resolved by single actions `PLACE_LOCO`
(onto an empty route slot — capacity Trans-Sib 2 / others 1, reach = sum) / `REPLACE_LOCO` (upgrade a
lower loco, the displaced one **cascading** into the lock — the pg. 11 chain reaction) / `FLIP_LOCO` (turn
to a factory and return to the supply, **only when no empty loco space remains** — the exact pg. 11
constraint); `legalActions` enumerating the place/upgrade/flip resolutions and refusing all else while the
lock is set; and **reach-gates-scoring** already honoured (RR2's `locoReach` = sum). Engine 100% (**111
tests**, up from 85 — a new `locomotive.test.ts` incl. the pg. 11 examples 3–4 chain reaction verbatim); a
backend REST test drives an acquire→upgrade→place chain over the wire; the client gained loco action
spaces, a **pending-loco panel** (place/upgrade/flip buttons), per-route loco readouts and feed narration
("took the #2 locomotive", "placed the #2 on Kyiv", "upgraded the #1 to the #2 …", "flipped the #1 to a
factory"); `e2e/russianrailroads.spec.ts` gained an acquire-and-place test (desktop + mobile). Rulings
below. **Track D findings: none new** — the whole slice landed inside the package (engine, module
`parseAction`, client), touching **zero** host files (no `games.config.ts`, no registry regen, no
vite/tsconfig/vitest edits), the RR2/RR3 pattern holding.

**RR4 rulings (with evidence):**
- **Stack size = player count — LANDED (pg. 12, verbatim).** The scope brief said "#2–#9 (4 each) + two #10
  (4+4)"; pg. 12 is explicit that each stack holds *player-count* locomotives ("4× #2, 4× #3 … in a
  4-player game"), so the model is `count`-per-stack — which **is** the brief's "4 each" at 4 players and
  correctly scales to 2/3 players (the SA14 "differences land with the mechanic" discipline). The two #10
  stacks are a real component split (pg. 4) that matters only for their *factory* action (pg. 48, RR5); RR4
  draws a #10 from whichever stack still has tiles.
- **Factory-building lands in RR5, not RR4 — LANDED (pg. 12–13).** The loco action spaces' "loco **or**
  factory" option and the third (3-worker) "loco **and** factory" space are **deferred to RR5**, because
  building a factory means placing it on the **industry track** (the wrench / left-to-right gaps, pg. 13) —
  the mechanic the roadmap already assigns to RR5. Same "add only spaces usable this slice" discipline
  RR2/RR3 used for the colour spaces. RR4 ships the two loco spaces as **locomotive-acquisition only**.
- **The flip-to-factory of RR4 is a *supply return*, not an industry placement (pg. 11).** A displaced/
  unwanted loco during an upgrade chain flips to its factory side and returns to the **supply pool**
  (`returnedFactories++`) — it does **not** touch the industry track. That is entirely an RR4 concern
  (pg. 11); RR5 later *draws* factories from that pool onto the industry track.
- **The flip is a gated *choice*, exactly as printed (pg. 11).** "As long as you have any empty spaces for
  locomotives left on any of your boards, you cannot choose to return an upgraded locomotive to the supply
  as a factory." Encoded literally: `FLIP_LOCO` throws `LOCO_FLIP_NOT_ALLOWED` while any loco slot is open,
  and `legalActions` only offers it when none is. A held loco is **always** resolvable (place if a slot is
  open; else upgrade a lower loco; else — nothing lower, no slot — flip), so the chain never wedges.

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
