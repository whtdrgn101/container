# Game Hub

A self-hosted **board-game platform** — a games room you host on your own machine. TypeScript
monorepo: a pure game **engine**, a Fastify **REST API** backed by SQLite, and a React + Tailwind +
shadcn **UI**, with each game plugged in behind shared seams.

Games built on it:

- **Container** (10th Anniversary Edition) — a 3–5 player economic supply-chain game.
- **Can't Stop** — a 2–4 player push-your-luck dice game.

> Learning project focused on good engineering practices: strong typing, clean separation, and
> high test coverage (100% on each game engine). See [`CLAUDE.md`](./CLAUDE.md) for the full design,
> conventions, and roadmap.

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

Open http://127.0.0.1:5173, start a game, and click **Produce**.

## Tests

```bash
pnpm test:engine        # unit tests + 100% coverage gate
pnpm test:backend       # API integration tests (in-memory SQLite)
pnpm typecheck          # strict typecheck, all packages

# End-to-end (first run only: install the browser)
pnpm --filter @game-hub/ui exec playwright install chromium
pnpm test:e2e           # auto-starts API + UI, runs desktop + mobile Chromium
```

## Layout

```
engine/    @game-hub/engine  — pure, deterministic rules core (100% tested)
backend/   @game-hub/backend — Fastify REST API + SQLite
ui/        @game-hub/ui      — React + Tailwind + shadcn
reference_material/           — the rulebook PDF (authoritative rules)
```

## Status

**Slice 0 — vertical slice.** The **Produce** action is wired end-to-end (engine → API → UI)
with tests at every layer, proving the architecture. The full ruleset is next, built as
vertical slices — see **[`ROADMAP.md`](./ROADMAP.md)** (and [`CLAUDE.md`](./CLAUDE.md) for design
& conventions).
