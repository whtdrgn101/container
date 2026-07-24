# Track D — Externalize games (design doc)

**Status: design only — no code.** Per the platform roadmap: four games have tested the engine and
the seams; the long-term goal is making games easier to add, and eventually addable from *outside*
this repo. Pilot candidate: Russian Railroads (a heavyweight is the right stress test).

This doc answers the four questions the roadmap poses: what a game package must export, how
registration/discovery works, what the version-compat contract with the kernel is, and what the seams
still assume about living in one workspace.

---

## 1. What a game *is* today — the touchpoint inventory

Adding game `foo` currently touches **seven registration points** across four packages (the
CLAUDE.md recipe, made explicit):

| # | Touchpoint | File | Nature |
|---|---|---|---|
| 1 | Engine subpath export | `engine/package.json` `exports["./foo"]` | mechanical |
| 2 | Vite alias for that subpath | `ui/vite.config.ts` | mechanical, **duplicates #1** |
| 3 | Backend module registration | `backend/src/games/index.ts` `.register(fooModule)` | one line |
| 4 | UI client registration | `ui/src/games/registry.ts` `CLIENTS` | one line + the one cast |
| 5 | Bot subpath export | `bot/package.json` `exports["./foo"]` | mechanical |
| 6 | The game folders themselves | `engine/src/games/foo/`, `backend/src/games/foo/`, `ui/src/games/foo/`, `bot/src/games/foo/` | the actual game |
| 7 | Reference material + roadmap | `reference_materials/`, per-game `ROADMAP.md` | docs |

Everything else is genuinely additive (proven four times). The friction is that one *game* is
**four sibling folders in four packages**, stitched by five config edits. Externalizing means: one
game = **one package**, one registration point per host.

## 2. The workspace assumptions that must dissolve

These are the things that only work because every game lives in this repo:

- **The engine ships TypeScript source, not a build.** The backend transpiles it via `tsx`/Vitest
  inline; the UI consumes it through **hand-maintained Vite aliases** (one per subpath — touchpoint
  #2). An external package cannot be consumed this way: **externalization forces a real `dist`**
  (the engine already has a `tsc` build target; it would become load-bearing for games).
- **The kernel lives *inside* `@game-hub/engine`** (`engine/src/kernel/`), and the backend's
  `GameModule` contract *restates* kernel types structurally (`MoveRecord`, `Viewer`) precisely so
  `module.ts` needn't import the engine. An external game needs a real shared dependency to build
  against: **the kernel must become its own package** (see §4).
- **The one registry cast** (`ui/src/games/registry.ts`) and the backend registry both assume
  registration happens in first-party code at build time. That stays true in phase D0–D1 (build-time
  registry, codegen'd); true runtime plugin loading is explicitly deferred (§6).
- **Tailwind content scanning**: game boards style themselves with Tailwind utility classes, and the
  UI's Tailwind build scans `ui/src/**`. A game package outside that glob would silently lose its
  styles — the content globs must include installed game packages (or games must ship compiled CSS).
  This is the sneakiest breakage in the list.
- **The e2e `architecture.spec.ts`** derives the game list from the filesystem (`readdirSync` of
  `ui/src/games/`) — right for in-repo games, meaningless for installed ones. It would read the
  generated registry instead.
- **Coverage gates are per-repo.** The 100%/90% gates are *this repo's* discipline; the platform
  cannot enforce them on an external package. The compat contract (§5) is what replaces them.

## 3. The game-package contract (proposed)

One npm package per game — `@game-hub/game-<id>` (or any name; the manifest's `id` is what matters)
— with **four subpath exports**, mirroring the four seams that already exist:

```
@game-hub/game-foo
├── ./engine   — the pure rules core (what engine/src/games/foo/index.ts exports today)
├── ./module   — the backend GameModule implementation (server-only; may import ./engine)
├── ./client   — the UI GameClient (lazy Board behind dynamic import; may import ./engine)
└── ./bot      — optional; the game's policies (pure; may import ./engine)
```

- Ships **built JS + `.d.ts`** (`dist/`), not TS source — consequence of §2. Board lazy-loading
  survives: the client entry stays a light object whose `Board` is `lazy(() => import('./board'))`,
  and bundlers code-split dynamic imports inside `node_modules` fine.
- **Peer-depends on `@game-hub/kernel`** (§4). Never depends on the platform's backend or UI
  packages — the module/client program against *contract types* re-exported by the kernel package.
- A tiny static **manifest** export (id, name, seat bounds, colors palette, kernel-contract version)
  that both hosts read *without* loading the heavy entries — today's `GameInfo`, formalized.

## 4. The kernel package — `@game-hub/kernel`

Extract `engine/src/kernel/` + the *contract types* into one small published package:

- What's in it: `GameError`, `MoveRecord`, `Viewer`, `record()`, `makeSeating`, `GameEndState` (all
  already kernel), **plus** the `GameModule`/`ModuleContext`/`BotDriver` interfaces (today in
  `backend/src/games/module.ts`) and the `GameClient` interface (today in `ui/src/games/types.ts`).
- The backend/UI keep their local copies as re-exports during migration, so this is a pure move.
- This resolves the current duplication where `module.ts` structurally restates `MoveRecord` — that
  trick exists *because* there was no shared package; with one, the restatement retires.

**Version-compat contract:** the kernel package's **major version is the contract version**. A game
manifest declares `kernelContract: N`; the registries refuse (loudly, at registration — the
`GameRegistry.register` throw pattern) a game whose declared contract ≠ the host's. Rules:

- Additive, optional additions to `GameModule`/`ModuleContext` (new optional hooks — the
  `pendingStep`/`onStateChanged` precedent) = **minor** bump; old games keep working.
- Anything that changes a required member's meaning = **major** bump; games must migrate.
- The platform promises `ModuleContext` stability within a major: injected rng, `games`, `hub`,
  `pushGame`, bot seats — the things every module already leans on.
- A game's own state-shape evolution stays *its own* business via `schemaVersion`/`migrate`
  (REVIEW §4.1) — deliberately orthogonal to the kernel contract version.

## 5. Registration & discovery

**Build-time, declarative — a `games.config.ts` at the repo root:**

```ts
export default ['@game-hub/game-container', '@game-hub/game-cantstop', /* … */];
```

A small codegen step (run in dev/build) turns that list into the two generated registries: the
backend's (imports each package's `./module`, `.register()`s them) and the UI's (imports each
`./client`). This keeps: the boot-time duplicate-id crash, the one documented cast, tree-shaking,
and static types. Adding a game becomes `pnpm add` + one line in one file.

What the platform **checks at registration** (replacing the coverage gates it can't enforce): id
uniqueness, seat bounds sanity, palette validity, kernel-contract match — plus a documented
"honest checklist" a game author runs (`module-seam`-style conformance suite exported by the kernel
package as a test helper: viewFor redaction round-trip, version monotonicity, parseAction
refuses server-only actions, legalActions ⊆ applyAction fuzz).

## 6. Explicitly deferred

- **Runtime plugin loading** (drop a package in, no rebuild): module federation / import maps /
  server-side dynamic `import()`. Real value only after the package contract has survived an
  out-of-repo pilot; adds signing/trust questions (a module runs server-side with DB access).
- **A generic sealed-input framework, still.** Container's auction stays behind `routes`/
  `pendingStep` — externalization doesn't change the "extract on the third example" rule.
- **Publishing to a public npm registry.** Workspace/git dependencies are enough for the pilot.

## 7. Migration plan — three phases, each shippable

- **D0 — in-repo restructure (pure refactor, the C0 discipline).** Extract `@game-hub/kernel`
  (workspace package, engine keeps re-exporting for compat); add `games.config.ts` + registry
  codegen; teach Tailwind the package globs; point `architecture.spec` at the generated registry.
  All four games keep living where they are. Every suite green, zero behavior change.
- **D1 — one game moves.** Can't Stop (smallest, no side-channels) becomes
  `packages/games/cantstop/` in-workspace with the four-subpath shape, consumed *as a package*
  (its `dist`, not aliases). This is the honest test of §3 — the workspace's version of the
  module-seam stub. Bake time: does DX survive (watch mode, test cycles)?
- **D2 — the out-of-repo pilot.** Russian Railroads built in its own repo against published (or
  git-dep) `@game-hub/kernel`, following the conformance checklist. What D2 surfaces that D1
  can't: docs quality, contract completeness, the real dependency/versioning friction.

## 8. Open questions for the owner

1. **Bot placement**: `./bot` inside the game package (proposed — it versions with the game) vs. a
   separate package. The `createBotDriver` hook already lives module-side, which argues for inside.
2. **Reference PDFs**: stay out of packages (copyright) — is a rulebook-page *citation convention*
   alone enough for external authors, or does the conformance checklist need a "rules provenance"
   section?
3. **Per-game e2e**: does the platform host a Playwright harness external games can plug specs
   into (heavy), or is e2e simply out of contract for external games (module conformance + their
   own testing)? Proposed: out of contract for D2; revisit if externals proliferate.
4. **Naming**: `@game-hub/game-<id>` asserts an org scope we don't own on npm. Fine for
   workspace/git deps; decide before any publish.
