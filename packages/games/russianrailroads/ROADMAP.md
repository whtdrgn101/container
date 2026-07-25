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

### RR5 — Industry: factories + the wrench ✅ *(shipped)*
The digest's hardest coupling, landed. Shipped: the **industry track** as data (`INDUSTRY_LANE` — 16 lane
entries, 5 gaps, START/END, read off the pg. 6 board art); **factory building** from the loco/factory action
spaces ("loco **or** factory" on the 1-/2-worker spaces, "loco **and** factory" on the new 3-worker space,
pg. 12) — flip the lowest locomotive (or a returned factory) violet and fill the **leftmost gap** left-to-right,
**replace any** slot once all 5 are filled (the replaced factory returns to the supply); the **shared pool made
real** — the `returnedFactories` count became a per-number multiset (a factory keeps its number, which decides
its action); **wrench movement** + the three industrialization spaces (pg. 14: 1w→1, 2w→2, 2w→1+wood), with the
**gap rule** (the wrench stops before an unfilled gap and can't skip it); **factory triggers into the action
pool** — the wrench moving *onto* a factory grants its indirect action (coins auto-resolve; track-move credits
enter `actionPool`, resolved via `RESOLVE_POOL` → the pending-moves lock, or forfeited with `SKIP_POOL` — the
pg. 13 "lost if unused"); and **industry scoring** (pg. 21: the wrench-space points, or the previous numbered
space on a factory/numberless space — the RR2 stub retired). Engine 100% (**149 tests**, +38 across new
`industry`/`factory`/`pool` files); a backend REST test drives build-factory → wrench-onto-factory → pool
action over the wire; `e2e/russianrailroads.spec.ts` gained a build-a-factory + advance-the-wrench test
(desktop + mobile). Rulings below. **Track D findings: none new** — the whole slice landed inside the package
(engine, module `parseAction`, client), touching **zero** host files, the RR2–4 pattern holding.

**RR5 rulings (with evidence):**
- **Industry-track layout — LANDED (pg. 6 board art @ 300 DPI, cross-checked pg. 13 diagram + pg. 21 example).**
  The rulebook prose only *describes* the track; the point values + gap positions are a component read. In play
  order: START(0) · **1 / 2 / 3 / 5** (the "first 4 spaces", pg. 13) · GAP1 · 10 · GAP2 · 15 · GAP3 · a
  **numberless** space (the pg. 6 idea-token/light-bulb marker, RR6) · GAP4 · 20 · GAP5 · 25 · END(50). The
  physical board is a hairpin (START tucked top, space 1 to its left, then a run along the bottom); logically it
  is one ascending lane (`INDUSTRY_LANE`). **5 gaps** at lane indices 5/7/9/11/13; the end (50) sits past GAP5, so
  it's reachable only once all five are filled (pg. 13). The pg. 21 example — wrench on a factory in the first
  gap scores 5, "the previous space" — is asserted verbatim and pins the 5-space immediately before GAP1.
- **Factory actions — RULING (the pg. 48 discovery).** The scope brief expected pg. 48 to tabulate the factory
  actions; **it does not** — pg. 48 is the *engineer* reference (its tiles carry engineer portraits). Each
  factory's action is a tiny icon in the **top-left of its locomotive tile** (pg. 11 "as a reminder"), and the
  rulebook gives no prose table. Read off the pg. 10 loco-supply art @ 300 DPI, only #2/#3 (a track tile /
  move-a-track pennant → **move a track**) and #6 (a gold coin → **gain a coin**) are confidently legible; #4
  (a light-bulb = idea token) and #9 (a card = bonus/idea card) clearly reference future mechanics, and #1/#5/#7/#8/#10
  are illegible. **Faithfulness ruling:** encode the confidently-read icons as real, RR5-resolvable actions
  (`FACTORY_ACTIONS`) and mark the rest **inert** (granted to the pool but non-resolvable → lost, pg. 13) with a
  per-number note — rather than invent firm rules from unreadable icons. This keeps the trigger/pool machinery
  real and tested; reconcile against physical tiles in RR9 (art polish). The two-action #10s are inert for the
  same reason (undocumented; unreachable in normal RR5 play anyway).
- **Pool-resolution design — RULING (pg. 7, 13).** `actionPool` became a first-class list of typed track-move
  **credits**. Choiceless effects (coins) **auto-resolve** when the wrench triggers a factory; choiceful ones
  (which track/colour) **defer to the pool**, resolved with `RESOLVE_POOL` (which opens the ordinary
  pending-moves lock — the binding "multi-step choices are engine locks" decision, so a factory move is spent one
  `MOVE_TRACK` at a time and control returns to the pool when the lock clears) or `SKIP_POOL` (forfeit the rest,
  pg. 13). The bottom industrialization space's wood bonus (pg. 14) is a wood-only pool credit, resolved the same
  way. `applyAction` gains a fourth lock tier (pool ⇒ only `RESOLVE_POOL`/`SKIP_POOL`); the pool is only ever
  non-empty for the seat mid-industrialization and clears before their turn passes.
- **"Loco AND factory" ordering — LANDED (pg. 12).** The 3-worker space builds both, in the player's chosen
  order (`first: 'loco' | 'factory'`), modelled with one `pendingThen` field: after the first build resolves, the
  engine opens the *other* lock (keeping the turn). The factory **tile** is chosen at resolution (`PLACE_FACTORY`/
  `REPLACE_FACTORY` with a `from`), not at placement, so the pg. 12 note — "first upgrade a locomotive, returning
  a factory to the supply, and then place the just-returned factory" — works: an earlier flip's factory is
  available to the later factory step.

### RR6 — Player-board specials + turn order ✅ *(shipped)*
The biggest remaining slice, landed in full. **(a) Route special spaces (pp. 18–19)** — encoded as data
(`SPECIALS`, from the pg. 6 board art) with the **reached-flag** model (`player.consumedSpecials` +
recomputed scoring specials): **new workers** (wood-only / loco-required, choiceless +1 permanent worker),
**end-station keys** (`pendingKey` → advance a wood + any track via the pool, **or** score 10, pg. 19),
**route doubling** (green+loco → that route ×2, recomputed), **cumulative bonus stars** (recomputed —
pg. 19 example verbatim), **idea-token spaces** + the **industry-track idea space** (`pendingIdeaToken`),
the **five idea tokens** (end-bonus draw-top + idea card, 20-point medal, revaluation flip, 2 keys, second
wrench — both wrenches score, pg. 47) and the **five idea cards** (`pendingIdeaCard`; wood worker / #9 loco /
engineer-coin real + two ADAPTED). New-track unlocks stay the RR3 computed thresholds (the board confirms
they're printed spaces). **(b) Turn order (pp. 16–17)** — the real **track** replaces RR1's dealt order:
`pass` flips the card and **scores its reverse**, the **two claim spaces** (not below your own pawn, not
both), the round-end **rearrangement** (claimants to the front — the pg. 17 special no-change case falls out
of the one formula), the **between-round worker-reuse mini-phase** (modelled as an engine phase/lock
`pendingReuse`: 2nd then 1st move a turn-order worker to an empty 1-worker space), and the **starting-bonus
setup mini-phase** (`pendingSetupBonus`: 4th → 3rd → 2nd at game start). Every multi-step choice is an
**engine lock** (the binding RR design decision), funnelled through one `continueTurn` (settle specials →
hold for a choice/pool → advance the reuse/setup phase or the next seat). Engine **100% (208 tests**, +59
across new `turnorder`/`specials`/`ideas`/`reuse`/`setupBonus` files); backend REST tests drive a key choice,
a pass-score and the reuse phase over the wire (**14** RR REST tests); `e2e/russianrailroads.spec.ts` gained
a turn-order-claim + reuse test and pass-score narration (**8** specs, desktop + mobile). UI: setup/reuse/key/
idea-token/idea-card panels, a turn-order-track readout, and a specials readout (keys/medal/tile). Rulings
below. **Track D findings: none new** — the whole slice landed inside the package (engine, module
`parseAction`, client), touching **zero** host files (no `games.config.ts`, no registry regen, no
vite/tsconfig/vitest edits), the RR2–5 pattern holding.

**RR6 rulings (with evidence):**
- **Route special-space layout — LANDED (pg. 6 board art @ 400 DPI, cross-checked pp. 18–19 + the two
  worked examples).** The prose gives the special *types*, not their positions — a component read (see
  `core/specials.ts` for the per-space table). Trans-Siberian: new-worker (loco) space 3, idea-token (loco)
  space 13, end key + gold-unlock space 15. St. Petersburg: idea-token (loco) spaces 4 & 6, route-doubling
  space 7, end key space 9. Kyiv: cumulative bonus stars 1/2/3/4 on spaces 1–4 (loco), new-worker
  (wood-only) space 7, end key space 9. The pg. 19 examples are asserted verbatim: **Kyiv space 3 + #3
  loco → 1+2+3 = 6**; the St. Petersburg idea-token example sits on space 4.
- **St. Petersburg / Kyiv length = 9 — LANDED (pg. 6 art).** Fixes the RR2/RR3 placeholders (7/8); both
  routes run spaces 1–9, the length the end-station keys + St. Petersburg's space-7 doubler need.
- **The wood-track prerequisite is a monotonic reached-index — LANDED (pg. 18).** "Nothing happens until
  track is built on the space" and "the prerequisite remains fulfilled even when you upgrade the space" fall
  out for free: a frontier only advances, so a met prereq stays met; one-time specials record consumption in
  `consumedSpecials`, scoring specials recompute from the board each phase.
- **Turn-order card reverse values — ART RULING (documented ADAPTED).** The reverse (pass-score) values are
  **not legibly readable** in the v2 PDF (pg. 5 shows only the numbered fronts; no page tabulates the backs).
  Adopted an increasing set rewarding later seats: `{1:0, 2:2, 3:4, 4:6}` (`TURN_ORDER_PASS_POINTS`).
  Reconcile against physical cards in RR9.
- **Revaluation tile values — ART RULING (documented ADAPTED).** The flipped valuation tile's values aren't
  legible at this DPI; adopted a strictly-≥-base set (`VALUATION_REVALUED` = 0/2/3/5/8, wood staying 0).
  Reconcile in RR9.
- **Idea-token set — COMPONENT RULING.** pp. 46–47 describe **five** distinct benefits; the pg. 6 art shows
  ≈6 physical tokens and the scope brief cited "9". The **rules text is authoritative over the ambiguous
  count**, so RR6 models the five described benefit *types*, one of each per player, each single-use (an
  idea-token space spends one). Exact multiset reconciled in RR9.
- **"Choose an end bonus card" (AMBIGUITY #3) — deferred, as planned.** RR6 implements **draw-top** from the
  pile (the scope brief's instruction) and leaves the draw-vs-pick ruling to **RR8** (it interacts with pile
  redaction + end-bonus scoring).
- **Idea cards — RULING (pg. 47 legibility).** pg. 47 legibly describes three (wood worker / #9 loco /
  engineer+coin); the game ships five. Encoded the three read benefits as real and two ADAPTED simple ones
  (`extra-coins`, `wood-move`), the END_BONUS_CARDS convention. The engineer half of `engineer-coin` is
  deferred to RR7 (engineers); the coin is granted now.
- **Starting bonus cards — ART RULING (documented ADAPTED).** The pg. 6 art shows four "simple action" cards,
  only partly legible; adopted four ADAPTED simple one-time actions (coins / a wood move / a wrench advance).
  **Simplification:** each seat may pick any of the four (the physical cards are shared/consumed; the ADAPTED
  model does not track that — negligible for four small bonuses). Reconcile in RR9.

**Scope notes / documented simplifications (reconcile later):** the reuse mini-phase targets the direct-action
1-worker spaces (coins / doubler / temp workers / industrialize-1 / track spaces) — loco-acquisition and
turn-order re-claim *via reuse* are deferred; the second wrench's 2 industry steps advance the new wrench
(no split-across-wrenches choice); the wood-worker card's passive +1 applies on wood-specific track spaces.

### RR7 — Engineers ✅ *(shipped)*
The engineer strip made real (pp. 7, 15–16, 22, 48). Shipped: **hiring** (`HIRE_ENGINEER` — pay 1 coin,
take the right-most/hiring-space engineer beside your board; the slot empties, so a hired engineer never
returns to the box and only one hire happens per round); **the private indirect action** (`USE_ENGINEER` —
a hired engineer's action, usable **once per round** via the new `usedEngineers` per-round flag: a track-move
feeds the **action pool** partially-resolvable/skippable, an immediate effect resolves at once — the pg. 7
"indirect actions … go into your action pool" model); **the two public variable action spaces**
(`USE_VARIABLE_ENGINEER` — the two horizontal engineers left of the hiring space are **direct** action
spaces anyone may use for 1 worker, occupied once/round via `engineer-var-<slot>`; a track-move opens the
pending-moves lock **directly**, must-resolve); the **14-engineer pg. 48 catalog typed as data**
(`EngineerAction`, on each `Engineer`); **unclaimed-engineer removal** (pg. 22 — the round-end slide drops the
right-most slot, which is `null` for a *hired* engineer and the unclaimed engineer otherwise); the
**`engineer-coin` idea card's engineer half wired** (RR6 deferral — now grants a coin **and** a free
hiring-space engineer); and **majority data exposed** (`engineerCount` / `highestEngineerNumber` for RR8, plus
`hiredEngineers`/`usedEngineers` on the view). UI: the engineer strip with region labels + rounds-remaining
display (pg. 22), a hire button, the two variable action-space buttons, a per-active-seat hired-engineers use
panel, a per-player 👷 hired count, and feed narration. Engine **100% (238 tests**, +30 across new
`actions/engineer` / `internal/engineers`); backend REST tests drive hire→use-next-round + a variable space
over the wire (**16** RR REST tests); `e2e/russianrailroads.spec.ts` gained a hire + variable-use spec (**5**
specs, desktop + mobile). Rulings below. **Track D findings: none new** — the whole slice landed inside the
package (engine, module `parseAction`, client), touching **zero** host files (no `games.config.ts`, no
registry regen, no vite/tsconfig/vitest edits), the RR2–6 pattern holding.

**The usable-when model (pg. 7, 15) — RULING.** pg. 7 is authoritative: a turn is "exactly 1 direct action or
pass," and "actions that become available … (by choosing an action space **or otherwise**) go into your action
pool … you can partially resolve" indirect ones. Modelled as three turn actions: `HIRE_ENGINEER` and
`USE_VARIABLE_ENGINEER` are ordinary turns (coin / worker); `USE_ENGINEER` is a **standalone turn** that spends
one hired engineer's once-per-round use (the `usedEngineers` flag) and resolves its action indirectly (pool for
a track-move, immediate otherwise). **Documented simplification:** `USE_ENGINEER` is its own turn rather than a
rider on another direct action — cleaner for the turn spine and faithful to pg. 15 ("each round, during your
turn … you can resolve your engineers' actions"). The variable spaces resolve **directly** (must-resolve),
matching pg. 15–16.

**Strip art readings (pp. 15–16, 22) — LANDED.** The strip is 7 slots at 3/4p (6 at 2p — pg. 23), read
**from the right end** so the geometry holds for both: right-most = the **hiring space** (1), the two before it
= the **variable action spaces** (2), the rest = the **left-hand / upcoming** engineers (4 at 4p). This matches
the pg. 15 diagram (4 left + 2 variable + 1 hiring) and the pg. 16 "4 left-hand spaces." The slide is one space
right per round (the existing `slideEngineerStrip`), an emptied left slot showing rounds-remaining (pg. 22).
Costs read off the art: hiring = **1 coin** (pg. 15 "place a coin onto the space"), variable = **1 worker**
(the pg. 15 example "place 1 worker on the left-hand engineer's action space").

**The pg. 48 engineer catalog — ART / FAITHFULNESS RULING (the RR5 `FACTORY_ACTIONS` precedent).** pg. 48 is
the engineer *reference*, but its portrait tiles are **not legibly tied to specific printed numbers** at this
DPI (the numbers 2–15 exist for the pg. 22 majority tiebreak; the tiles describe *actions*). So, exactly the
RR5/RR6 convention: the **actions are read off pg. 48 (+ the pg. 15 variable example) and cited**, while the
**number → action assignment is a documented ADAPTED read** (reconcile physical tiles in RR9). Actions mapping
to existing machinery are **LIVE**; three that need a mechanic RR7 does not build are typed **inert** (hireable
+ majority-counting, non-resolvable). The catalog (# → action, one line each):

| # | action | pg. 48 tile / note |
|---|--------|--------------------|
| 2 | `moveTrack` 1 green (letterless — set aside on its idea card, pg. 5) | "move a green track behind the bronze" |
| 3 | `moveTrack` 3 (any accessible) | "move 3 different tracks 1 space each" |
| 4 | `moveTrack` 2 (any accessible) | a stronger track-extension engineer |
| 5 | `coins` 3 | pg. 15 "similar to the board actions, a bit stronger" |
| 6 | `coins` 2 | pg. 15 |
| 7 | `doubler` + score 5 | the pg. 15 variable-engineer example ("take a doubler … score 5") |
| 8 | `score` 5 | pg. 48 star (immediate VP) |
| 9 | `score` 8 | pg. 48 star |
| 10 | `scoreLocomotives` (Σ your 2 highest locos) | pg. 48 "sum of your 2 highest-number locomotives" |
| 11 | `scoreEngineers` (Σ your engineer numbers) | pg. 48 "sum of the numbers of all your engineers" |
| 12 | `moveTrack` 2 (any accessible) | (reuse) pg. 48 track engineer |
| 13 | **inert** | "repeat a previously-occupied single-worker action" — needs occupancy replay, RR9 |
| 14 | **inert** | "use another player's engineer action space" (2-player) — cross-player, RR9 |
| 15 | **inert** | "choose another end bonus card / score 10" — end-bonus scoring, RR8 |

**Scope notes / documented simplifications (reconcile later):** the number ↔ action assignment above is ADAPTED
(the pg. 48 tiles are not legibly numbered — RR9 art polish); the three inert engineers land with their real
mechanics (RR8 end-bonus scoring; RR9 the occupancy-replay + cross-player-interaction engineers). The
engineer-majority **scoring** (40/20, pg. 22) is RR8 — RR7 only exposes the count + highest-number data.

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
