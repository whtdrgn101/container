# Labyrinth (game 6) — the D2 kickoff: rules digest + slice plan

**Owner call 2026-07-29:** Track D **D2 (the out-of-repo game) starts now**, with **Labyrinth**
(Ravensburger, *The aMAZEing Labyrinth*, 2017 rules in `reference_materials/TheAMAZEingLabyrinth.pdf`).
Decisions made at kickoff:

- **Distribution: public npm** under the `game-hub` org (verified unclaimed on npmjs 2026-07-29 —
  claiming it is the owner's one manual step; free for public packages). This resolves the design doc's
  §8 open question 4 (naming/scope).
- **The game lives in a new public repo** (`whtdrgn101/game-labyrinth`) — a true external consumer whose
  CI installs *published* `@game-hub/*`. Public ⇒ free unlimited GitHub Actions.
- **Art: classic theme, original illustrations.** The enchanted-labyrinth fiction and traditional
  treasure set stay (mechanics and a treasure list aren't copyrightable); Ravensburger's *illustrations*
  are, so every asset is drawn fresh in the house style. Comps-first on the artifact (the SP8/RR9 flow).
- **Why this game:** the owner's household favourite, and the grid/path-routing state is a genuine
  engine workout unlike any hosted game (see "why it flexes" below). Its board UI should also feed
  ideas back into the RR9b revamp (which is queued right after).

This file seeds the new repo's `ROADMAP.md` + rules digest and **moves there when D2c scaffolds it**;
it lives here until then so the plan isn't tribal knowledge.

## Rules digest (rulebook read 2026-07-29 — 2 pp.; page refs are to that PDF)

- **Board**: 7×7 = 49 squares. **16 fixed tiles** at the even/even coordinates: 4 corner starting
  squares (one per player colour) + 12 treasure-bearing T-junctions. Shapes/orientations/treasures are
  *not* tabulated in the rulebook text — **transcribe them from the pg. 1 board photo at L0** and cite it.
- **34 movable tiles**: 12 straights (no treasure), 16 corners (6 with treasure), 6 T's (all with
  treasure). ⚠️ The rulebook omits this distribution entirely; verified against independent
  implementations 2026-07-29 and cross-checked by the treasure math (12 fixed + 6 + 6 = 24 = the card
  count). 33 are shuffled and placed at setup (injected rng: order *and* per-tile orientation); 1
  remains as the extra tile (pg. 1 Set Up).
- **24 treasure cards**, shuffled and dealt evenly — 12/8/6 each at 2/3/4 players (pg. 1). Kept as
  face-down stacks; **hidden info**: a player sees only *their own top card* (pg. 2). Public: everyone's
  flipped-card piles and stack counts.
- **Turn = two mandatory-ordered steps** (pg. 2): **1) slide the maze, 2) optionally move.**
  - **Slide**: 12 arrows mark the insertion points (both ends of the 3 movable rows and 3 movable
    columns — the odd indices). Insert the extra tile (any of its 4 rotations) at an arrow; the
    opposite-end tile is pushed out and becomes the new extra tile. **The one illegal slide: re-inserting
    where the last tile was pushed out** (pg. 2 "the only exception") — state carries a `lastPush`; all
    12 are legal on the first turn.
  - A pawn standing on the pushed-out tile **wraps around** to the newly inserted tile (pg. 2) — not a
    move. First hosted game where one player's action relocates another's piece.
  - The slide is **mandatory even if you could reach your treasure without it** (pg. 2 "Important").
  - **Move**: to any square reachable along connected paths, any distance, or stay put (pg. 2). No
    blocking — the rulebook has no occupancy restriction; pawns share squares.
- Landing on your current card's treasure **flips the card face-up** (public) and reveals your next
  target (pg. 2).
- **Win**: all your cards flipped **and** your pawn back on its own starting corner — immediate (pg. 2
  Ending the Game).
- **Deviations to log at L0**: start player — the physical rule ("the last player to go on a treasure
  hunt goes first", pg. 2) is undigitizable; replace (injected-rng or seat 0 — decide and record). The
  contents/setup piece-count contradiction (4 vs "one of the 6", a print-run artifact) is moot at 4 pieces.
- **Variant (later slice)**: "For younger children" (pg. 2) — all cards face-up, chase any of your
  treasures in any order. Removes the hidden info; a clean rules toggle.

## Why this game flexes the engine

- **Connectivity over mutating topology**: movement legality is a flood-fill over tile edge-matching,
  recomputed after every slide; a full decision is slide (≤12 arrows × 4 rotations, minus the reverse)
  × reachable-set — bounded but real search, and the bot (L5) will search it.
- **Redaction with structure**: per-player secret *stacks* where only the owner's top card shows —
  SP-style `viewFor` with a new shape (SP redacts whole hands; this redacts all-but-top of your own).
- **Setup-only randomness** (shuffle, orientations, deal) — RR-style; no per-action rng.

## D2 slice plan (platform first — each green, shippable, in the hub repo until D2c)

- **D2a — kernel `dist` + publish readiness** ✅ (2026-07-29): a real build for `@game-hub/kernel`,
  publish-ready at `1.0.0`, and kernel-major-as-contract-version enforced at registration. Findings and
  the full shipped list live in the design doc's §4 "Delivered in D2a".
  - **Deviation from the slice sketch — "no TS-source consumption" was deliberately *not* done.** The
    hub's backend (esbuild bundle), UI (Vite aliases) and every vitest run keep consuming the kernel's
    **TS source** in-workspace; pnpm's `publishConfig.exports` rewrites the same three subpaths to
    `dist/` in the tarball only. Switching the hosts onto `dist` would have been a large, risky change
    with no D2 benefit — the out-of-repo consumer is the one that needs `dist`, and D2c proves it.
  - **Deviation — `npm publish` did not run.** The `game-hub` npm org still doesn't exist. Everything up
    to a proven-good tarball shipped instead: `pnpm --filter @game-hub/kernel pack:smoke` packs, installs
    outside the workspace, and drives all three subpaths with plain `node` + a `nodenext` `tsc` consumer.
    It runs in CI after the unit tests.
  - **Biggest finding:** the pre-existing `tsconfig.build.json` emitted extensionless relative imports,
    so the built package was unloadable by Node — green in every repo suite, broken on install. Shipped
    kernel sources now carry explicit `.js` extensions. Any game package that later ships a `dist`
    inherits this rule.
  - Owner manual steps still outstanding: create the npm `game-hub` org, provide a publish token (or
    `npm login`), then `pnpm --filter @game-hub/kernel publish`.
- **D2b — `@game-hub/ui-kit`**: transport DTOs (`GamePayload`/`GameMessage`) move into
  `@game-hub/kernel/client`; shared chrome (`TurnBanner`/`ActivityFeed`/`GameOver`) extracts to a
  published `@game-hub/ui-kit`, answering the Tailwind content-glob problem (design doc §2). Closes
  D1 contract gap #1.
- **D2c — scaffold `whtdrgn101/game-labyrinth`** (public): the four-subpath package shape consuming
  *published* packages only, its own CI (typecheck, engine 100% / bot 90% gates). This file's digest +
  slice plan move there as its ROADMAP.
- **D2d — hub consumption**: `@game-hub/game-labyrinth` published; the hub adds the dep +
  `games.config.ts` entry + `pnpm generate`. ⚠️ The in-workspace shims (per-subpath Vite aliases, TS
  includes, vitest inline regexes) must **not** grow a sixth copy — dist consumption is the point.
  Per-game e2e stays out of contract (design doc §8 Q3); the hub gets a minimal hosted-game smoke.

## Labyrinth slice plan (L-slices, in the new repo; vertical, each green + demoable)

- **L0 — data spine**: types, tile/treasure data, the fixed-board transcription (pg. 1 photo, cited),
  `createGame` (injected-rng shuffle/orientations/deal), the start-player deviation decision.
- **L1 — the slide**: arrows, rotation, the no-reverse rule, pawn wraparound, move log.
- **L2 — movement + treasure + win**: flood-fill reachability, move/stay, card flip, game end. The
  engine 100% gate holds from here on.
- **L3 — module**: `viewFor` (secret stacks, top-card-only), `parseAction`, `summarize`, `mapError`;
  conformance against the module-seam expectations.
- **L4 — client**: the board UI, comps-first (classic theme, original art). Findings feed RR9b.
- **L5 — bot**: slide×rotation×move search over the redacted view, greedy baseline, bench calibration
  (the CS4 convention), 90% gate.
- **L6 — polish**: the younger-children variant, tooltips, a11y pass.
