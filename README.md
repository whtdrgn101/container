# Game Hub

A self-hosted **board-game platform** — a games room you host on your own machine. TypeScript monorepo: a
neutral **kernel**, one **package per game** (each a pure rules engine + a backend module + a UI board + an
AI bot), a Fastify **REST API** backed by SQLite, and a React + Tailwind + shadcn **UI** shell — with every
game plugged in behind shared seams the platform knows nothing about.

Games built on it:

- **Container** (10th Anniversary Edition) — a 3–5 player economic supply-chain game.
- **Can't Stop** — a 2–4 player push-your-luck dice game.
- **Stone Age** — a 2–4 player worker-placement Euro.
- **Saint Petersburg** (1st edition) — a 2–4 player card-buying engine game (real hidden information).
- **Russian Railroads** (Ultimate edition) — a 2–4 player worker-placement game; the package-shaped pilot.

> Learning project focused on good engineering practices: strong typing, clean separation, and high test
> coverage (100% on each game engine, 90% on each bot). See [`CLAUDE.md`](./CLAUDE.md) for the working
> agreement and [`docs/design-patterns.md`](./docs/design-patterns.md) for how the platform works.

## Requirements

- Node.js **22+** (`.nvmrc`)
- pnpm **11+** (`brew install pnpm`)

## Quickstart

```bash
pnpm install

# Run the app (two terminals)
pnpm dev:backend        # API   → http://127.0.0.1:3001
pnpm dev:ui             # UI    → http://127.0.0.1:5173  (proxies /api → backend)
```

Open http://127.0.0.1:5173, pick a game, and play.

## Tests

```bash
pnpm test:games         # every game package's engine (100%) + bot (90%) coverage gates
pnpm test:backend       # API integration tests (in-memory SQLite)
pnpm typecheck          # strict typecheck, all packages
pnpm bench              # dev-only bot-strength harness (win rate + Wilson CI)

# End-to-end (first run only: install the browser)
pnpm --filter @game-hub/ui exec playwright install chromium
pnpm test:e2e           # auto-starts API + UI, runs desktop + mobile Chromium
```

## Layout

```
packages/kernel/       @game-hub/kernel — primitives + the GameModule/GameClient contracts (100% tested)
packages/games/<id>/   @game-hub/game-<id> — one package per game: ./engine ./module ./client ./bot
packages/bench/        @game-hub/bench — dev-only bot-strength harness
backend/               @game-hub/backend — game-agnostic Fastify REST API + SQLite
ui/                    @game-hub/ui — game-agnostic React + Tailwind + shadcn shell
games.config.ts        the ordered list of hosted games → `pnpm generate` → the two registries
reference_materials/   the rulebook PDFs (gitignored — authoritative rules)
```

## Docs

- **[`CLAUDE.md`](./CLAUDE.md)** — what this is, the non-negotiables, commands, the working agreement.
- **[`docs/design-patterns.md`](./docs/design-patterns.md)** — how the platform works and why.
- **[`docs/game-creation.md`](./docs/game-creation.md)** — the complete "add a game" recipe.
- **[`ROADMAP.md`](./ROADMAP.md)** — the platform roadmap; per-game roadmaps at `packages/games/<id>/ROADMAP.md`.
- **[`DEPLOY.md`](./DEPLOY.md)** — self-hosting (Docker / Portainer / home NAS).
