/**
 * The kernel **contract version** (Track D design doc §4) — the number a game declares to say which
 * host↔game contract it was built against.
 *
 * ## The rule
 *
 * **The kernel package's major version *is* the contract version.** `@game-hub/kernel@1.x.y` ⇒ contract
 * `1`. So:
 *
 * - **Additive, optional additions** to `GameModule`/`ModuleContext`/`GameClient` — a new optional hook
 *   (the `pendingStep`/`onStateChanged` precedent), a new optional field — are a **minor** bump. Games
 *   built against any earlier `1.x` keep working untouched, so this constant does **not** move.
 * - **Anything that changes the meaning of a required member** — a renamed or retyped method, a new
 *   *required* member, a redaction guarantee that stops holding — is a **major** bump, and this constant
 *   moves with it. Every game must then be migrated and re-declare.
 * - What the platform promises to keep stable within a major: `ModuleContext`'s injected `rng`, `games`,
 *   `hub`, `pushGame` and bot seats — the things every module already leans on.
 *
 * A game's own persisted-state evolution stays *its* business via `schemaVersion`/`migrate`
 * (REVIEW §4.1) — deliberately orthogonal to this number.
 *
 * ## How it is enforced
 *
 * A module declares `kernelContract` (see `GameModule`) and the host's registry refuses a mismatch
 * loudly at registration — the boot crash, not a runtime surprise mid-game. The check lives in
 * `backend/src/games/registry.ts`, next to the duplicate-id and seat-bound checks, because registration
 * is the one moment the host holds both numbers. A game that **omits** the declaration is treated as
 * contract 1: every game predates this field, and defaulting is what keeps the transition additive
 * rather than a flag day. Once a contract 2 exists that default becomes a lie and the field must go
 * required — noted in the design doc so it isn't forgotten.
 *
 * The honest way for a game to declare it is to re-export *this* constant from the kernel it built
 * against (`kernelContract: KERNEL_CONTRACT_VERSION`) rather than hard-coding a literal: if a game ends
 * up resolving its own, different, `@game-hub/kernel` copy, its constant carries that copy's number and
 * the mismatch is caught instead of silently passing.
 *
 * ## Version history (why the package version is where it is)
 *
 * - **1.0.0** (D2a) — first publishable kernel: primitives, `./bot`, the `GameModule`/`GameClient`
 *   contracts, and this constant.
 * - **1.1.0** (D2b) — *additive*: `@game-hub/kernel/client` gained the transport DTOs
 *   (`GamePayload`/`GameIdentity`/`GameMessage`, `contracts/transport.ts`), which previously lived in the
 *   hub's `ui/src`. Nothing existing changed shape or meaning and no member became required, so by the
 *   rule above this is a **minor** bump and the contract stays **1** — a game built against 1.0.0 still
 *   compiles and registers untouched.
 * - **1.2.0** (D2c findings §16 + §13) — *additive*: two independent additions, neither of which
 *   changes an existing member's meaning or adds a required one, so again **minor**, contract stays
 *   **1**.
 *   1. **The colour channel.** `GameModule.createGame`'s players element gained an optional
 *      `color?: string` — the seat colour the host already resolved (picks honoured, the rest filled
 *      from the palette) — so a game where the colour *is* a rule (Labyrinth's starting corner) can
 *      read the lobby's pick instead of guessing at it. Strictly additive on both sides: the host only
 *      ever *adds* a property, and `{ name: string }[]` is still assignable to the widened parameter,
 *      so a 1.0.0/1.1.0 game that declares the narrow shape keeps compiling and ignores the field —
 *      which is exactly what all five hosted games do.
 *   2. **The rng helpers on the `.` barrel.** `mulberry32` (previously only on `./bot`, so an *engine*
 *      test had to reach into the bot subpath or reimplement it) and `shuffle` (Fisher–Yates, the
 *      helper four in-repo engines had each written for themselves) are now exported from the
 *      framework-free barrel. Pure additions to the export surface — nothing moved off `./bot`.
 * - **1.3.0** (2026-07-31) — *additive*: two independent additions to `@game-hub/kernel/client`, neither
 *   changing an existing member's meaning or adding a required one, so again **minor**, contract stays
 *   **1**. A game built against any earlier `1.x` compiles and registers untouched.
 *   1. **Typed platform envelopes.** The DTOs (`ChatMessage`, `PresenceViewer`), the frame shapes
 *      (`ChatPush`/`PresencePush`) and the two narrowing guards (`isChatPush`/`isPresencePush`) for the
 *      platform's `chat` and `presence` socket frames now live on the client subpath (`contracts/platform.ts`).
 *      They previously lived twice over — once in the hub's `ui/src` and once in the backend — even though
 *      both hosts speak the same wire frames; the shared contract is their proper home. `GameMessage` is
 *      **left open on purpose** (`{ type: string; [k]: unknown }`): these are *typed recognisers* for two
 *      known frames, not a closed union, so a new platform or game frame still flows without a kernel bump.
 *      Purely additive to the export surface — nothing that already shipped changed shape.
 *   2. **`GameClient.icon`.** A new **optional** `Icon` field on the `GameClient` contract — a game's own
 *      "box lid" identity mark, a `LazyExoticComponent<ComponentType<{ className?: string }>>` erased and
 *      lazy-loaded exactly like `Board`. Optional, so every existing `GameClient` (which omits it) still
 *      satisfies the contract; the shell renders it (with a neutral fallback) in the Card Table redesign.
 * - **1.4.0** (2026-08-09) — *additive*: two independent additions, neither changing an existing
 *   member's meaning nor adding a required one, so **minor** again and the contract stays **1**. A game
 *   built against any earlier `1.x` compiles, registers and behaves identically — verified by leaving
 *   all seven hosted games untouched across the bump.
 *   1. **A typed move log.** `MoveRecord` gained a type parameter for the game's own record-type union
 *      (`MoveRecord<'BID' | 'PLAY' | …>`), `VersionedState` forwards it, and `record()`'s `type`
 *      argument is now `RecordTypeOf<S>` — checked against the state's own log rather than being a bare
 *      `string`. Previously a game could log `'TRIKC'` and nothing would notice: not the compiler, not
 *      the tests asserting `'TRICK'` (they just never match), not the feed (it renders what it is
 *      handed) — and the entry is on the wire and in the replay, so the audit record is permanently
 *      wrong. Both parameters **default to `string`**, so a game that has not typed its log is entirely
 *      unaffected; typing it is opt-in, per game, whenever that game next has reason to.
 *      ⚠️ Type it against what the game **logs**, not its `ActionType`: a cascade appends entries no
 *      client ever sends (Argute's third trick appends `TRICK`, `HAND` and `DEAL` from one `PLAY`), so
 *      the two unions are related but genuinely different sets.
 *   2. **`GameClient.version`.** A new **optional** field carrying the game package's own version, so a
 *      host can say which build of a game is on the table. Without it a host has to read versions out of
 *      `node_modules` itself at build time — which the hub did, and which made displaying a string cost
 *      every host its own package resolution. A game should fill it from its package.json at build time,
 *      never by hand; a literal is a second place the version lives and the two drift.
 */
export const KERNEL_CONTRACT_VERSION = 1;
