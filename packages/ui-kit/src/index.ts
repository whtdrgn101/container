// @game-hub/ui-kit — the shared **board chrome** every game's UI renders inside, plus the game-facing
// REST helpers it calls (Track D / D2b, closing design-doc "contract gap #1").
//
// These frames grew inside `ui/src/components/` while every game lived in this repo, and a game package's
// `./client` reached them through the shell's `@` alias. That works in one workspace and not at all from
// `node_modules`, so everything a *game* imports moved here and the shell now imports it from here too —
// one copy, one place, no duplication. What stayed behind is what only the shell uses: the landing, the
// header, the lobby/waiting room, the catalog + lobby endpoints, and the WebSocket (**the shell owns the
// socket** — design-patterns §1).
//
// The rule for what belongs here: **if a game client imports it, it lives in ui-kit.** If only the shell
// does, it stays in `ui/src`.
//
// ⚠️ **Tailwind.** These components style themselves with Tailwind v4 utilities over the *host's* semantic
// tokens (`bg-card`, `text-muted-foreground`, `border-border`, …) — this package ships **no CSS**, so it
// inherits the host's theme instead of fighting it. A host must therefore teach its Tailwind build to scan
// this package, or the classes are silently pruned and the chrome renders unstyled:
//
//     @import 'tailwindcss';
//     @source '../node_modules/@game-hub/ui-kit';   /* installed */
//
// (In this repo the hub's `ui/src/index.css` covers it with `@source '../../packages'`.) The host also
// owns the token definitions (`--color-card`, `--color-primary`, …) — see `ui/src/index.css` for the set
// this chrome expects. Rationale and the alternatives weighed: `docs/track-d-externalize-games.md` §2.
//
// ⚠️ **Relative imports here carry an explicit `.js` extension**, the same rule the kernel adopted in D2a:
// this package is published and consumed from `dist/`, and plain Node ESM does no extension resolution.
// `.js` specifiers resolve to the `.tsx`/`.ts` source in-workspace and to the emitted `.js` in the tarball.

// The chrome — the frames a board renders inside.
export { ActionTip } from './components/ActionTip.js';
export type { ActionTipProps } from './components/ActionTip.js';
export { ActivityFeed } from './components/ActivityFeed.js';
export type { ActivityFeedProps, LogEntry } from './components/ActivityFeed.js';
export { GameOver } from './components/GameOver.js';
export type { GameOverProps } from './components/GameOver.js';
export { PanZoom } from './components/PanZoom.js';
export { TurnBanner } from './components/TurnBanner.js';
export type { TurnBannerProps } from './components/TurnBanner.js';

// The shadcn primitives the chrome and the boards share (copied in, extended in place).
export { Button, buttonVariants } from './components/ui/button.js';
export type { ButtonProps } from './components/ui/button.js';
export { Card, CardContent, CardFooter, CardHeader, CardTitle } from './components/ui/card.js';

// Platform rules a board applies but does not own.
export { seatIdentity } from './seatIdentity.js';
export type { SeatIdentity, SeatIdentityInput } from './seatIdentity.js';
export { RematchContext } from './rematch.js';
export type { RematchControls } from './rematch.js';

// The class merger every board uses for conditional Tailwind classes.
export { cn } from './utils.js';

// The game-facing REST helpers. The DTOs they return are contract and live in `@game-hub/kernel/client`.
export { apiUrl, applyAction, configureTransport, fail, getGame, JSON_HEADERS, unwrap } from './transport.js';
export type { TransportOptions } from './transport.js';
