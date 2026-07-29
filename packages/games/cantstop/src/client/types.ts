import type {
  BoardProps as KernelBoardProps,
  GameClient as KernelGameClient,
  GameMessage,
  GamePayload,
} from '@game-hub/kernel/client';

/**
 * The `GameClient` seam, bound for Can't Stop (Track D — legacy-migration phase 2).
 *
 * The kernel exposes the framework-level `GameClient`/`BoardProps` *contract*; this file pins its generic
 * transport parameters to the UI shell's concrete DTOs (`GamePayload<S>`, `GameMessage`) — exactly the
 * binding `ui/src/games/types.ts` makes for the in-repo games, and the RR pilot's `src/client/types.ts`.
 * Because this package lives outside `ui/src`, it reaches the shell's transport types (and the shared
 * board components) through the UI's `@` alias — a Track D finding logged in the ROADMAP: the shell isn't
 * yet a package a game can depend on, so the client subpath still couples to `ui/src` at build time.
 */
export type GameClient<S> = KernelGameClient<S, GamePayload<S>, GameMessage>;

/** What the shell hands the board — the kernel contract with this shell's transport DTOs bound in. */
export type BoardProps<S> = KernelBoardProps<S, GamePayload<S>, GameMessage>;
