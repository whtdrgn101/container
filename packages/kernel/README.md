# @game-hub/kernel

The tiny shared core of [Game Hub](https://github.com/whtdrgn101/container), a self-hosted
board-game platform: the primitives every game package and both hosts (backend + UI shell) build
against, and nothing else.

## What's in it

- **`.`** — `GameError`, `MoveRecord`, `Viewer`, `record()`, `makeSeating`, `GameEndState`, the
  `GameModule`/`ModuleContext` contract (with structural host interfaces, so the kernel imports no
  host), and `KERNEL_CONTRACT_VERSION`.
- **`./bot`** — `runBotLoop` and the bot-driver helpers, written entirely against the generic
  contract surface.
- **`./client`** — the `GameClient`/`BoardProps` contract the UI shell loads a game's board through,
  plus the **transport DTOs** a client names (`GamePayload`, `GameIdentity`, `GameMessage`). Type-only
  React usage; React is not a runtime dependency.

The shared *chrome* a board renders inside (turn banner, activity feed, end screen, buttons) is a
separate package, [`@game-hub/ui-kit`](https://www.npmjs.com/package/@game-hub/ui-kit) — it needs React
at runtime, which this package deliberately never does.

## The contract version

The package's **major version is the kernel contract version**. A game module declares
`kernelContract` (import `KERNEL_CONTRACT_VERSION`, never a literal); a host refuses to register a
game built against a different contract. Additive optional hooks are minor bumps; any change to a
required member's meaning is a major.

## Writing a game

A game is one npm package with four subpath exports — `./engine` (pure rules), `./module` (backend
seam), `./client` (UI seam), `./bot` (optional AI) — peer-depending on this kernel. The full recipe,
seam rules, and conformance expectations live in the platform repo's `docs/game-creation.md` and
`docs/design-patterns.md`.

Game engines built on this kernel are **pure**: no `Date`, no `Math.random`, no mutation — randomness
is injected at setup and per action, so every game is deterministic and replayable.
