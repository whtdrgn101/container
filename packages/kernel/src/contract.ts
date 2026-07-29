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
 */
export const KERNEL_CONTRACT_VERSION = 1;
