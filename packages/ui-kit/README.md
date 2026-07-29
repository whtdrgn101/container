# @game-hub/ui-kit

The shared **board chrome** of [Game Hub](https://github.com/whtdrgn101/container), a self-hosted
board-game platform: the frames every game's board renders inside, plus the handful of REST calls a
game client makes. Pairs with [`@game-hub/kernel`](https://www.npmjs.com/package/@game-hub/kernel),
which owns the contracts and the DTOs.

A game package's `./client` should import **only** these two packages (plus React and its own engine).
If it reaches into a host's source tree, it isn't installable.

## What's in it

- **Chrome** — `TurnBanner` (the `role="status"` "your turn" frame), `ActivityFeed` (the 🤖-badged
  move log; the per-game part is a `describe(entry) => string | null` closure), `GameOver` (every
  game's end screen, with the host's rematch button wired through `RematchContext`), `ActionTip`
  (hover/focus help on an action spot), `PanZoom` (a dependency-free zoom viewport for a detailed
  board on a small screen).
- **Primitives** — `Button`, `Card…` (shadcn, copied in and extended in place) and `cn`.
- **Platform rules** — `seatIdentity`, which answers "may this client act right now?" (`canDrive`) and
  "what are its seats called?" (`myNames`). **Gate every action affordance on `canDrive`.**
- **Transport** — `getGame`, `applyAction`, `unwrap`, `fail`, `JSON_HEADERS`, `apiUrl`. The DTOs they
  return (`GamePayload`, `GameMessage`) live in `@game-hub/kernel/client`.

## Using it — the two things a host must do

**1. Configure the transport once, at boot**, before anything renders:

```ts
import { configureTransport } from '@game-hub/ui-kit';

configureTransport({ baseUrl: '' }); // '' when the API is same-origin; '/api' behind a dev proxy
```

This package deliberately contains no `import.meta.env`: baking a bundler's build-time constant into
a published `dist/` is at best fragile and at worst wrong for whoever installs it. A **game** never
calls this — the host does.

**2. Teach Tailwind to scan this package.** The chrome styles itself with Tailwind v4 utilities and
ships **no CSS**, so it inherits the host's theme rather than fighting it. Tailwind v4's automatic
content detection skips `node_modules`, so without an explicit source its classes are silently pruned
and the chrome renders unstyled:

```css
@import 'tailwindcss';
@source '../node_modules/@game-hub'; /* path is relative to this stylesheet */
```

The host also owns the design tokens the chrome reads — `--color-background`, `--color-foreground`,
`--color-card(-foreground)`, `--color-primary(-foreground)`, `--color-secondary(-foreground)`,
`--color-muted(-foreground)`, `--color-accent(-foreground)`, `--color-destructive`, `--color-border`,
`--color-input`, `--color-ring`, and `--radius-{sm,md,lg}` — plus the optional `.reveal-in` entrance
animation `GameOver` uses. Define them in an `@theme inline` block (see the platform repo's
`ui/src/index.css` for the reference set).

## Versioning

Independent of the kernel's, and **not** the host↔game contract version — that is the kernel's major
(`KERNEL_CONTRACT_VERSION`). This package follows plain semver on its component surface.
