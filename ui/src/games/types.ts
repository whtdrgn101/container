import type { BoardProps as KernelBoardProps, GameClient as KernelGameClient } from '@game-hub/kernel/client';
import type { GameMessage, GamePayload } from '@/lib/api';

/**
 * The `GameClient` seam (roadmap C2) — the UI's binding of the shared kernel contract.
 *
 * As of Track D / D0 the *interfaces* live in `@game-hub/kernel/client`, so an out-of-repo game
 * package's UI can build against them. This file pins the kernel contract's generic transport
 * parameters to *this* shell's concrete DTOs (`GamePayload<S>`, `GameMessage`), which keeps every
 * board's `BoardProps<S>` and the registry's `GameClient<S>` reading exactly as they did before D0 —
 * one type argument, fully concrete. The seam rules are unchanged; see the kernel's doc comments.
 *
 * **This file must never import a game** — it is the contract binding; `games/<game>/` is one
 * implementation and `registry.ts` is the lookup.
 */
export type GameClient<S = unknown> = KernelGameClient<S, GamePayload<S>, GameMessage>;

/** What the shell hands a board — the kernel contract with this shell's transport DTOs bound in. */
export type BoardProps<S> = KernelBoardProps<S, GamePayload<S>, GameMessage>;
