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
 */
export const KERNEL_CONTRACT_VERSION = 1;
