import type { FastifyInstance } from 'fastify';
import type {
  GameModule as KernelGameModule,
  ModuleContext as KernelModuleContext,
  ModuleHub,
  ModuleBotSeats,
} from '@game-hub/kernel';
import type { BotRepository } from '../bots';
import type { DB } from '../db';
import type { GameHub } from '../hub';

/**
 * The `GameModule` seam (roadmap C0) — the backend's binding of the shared kernel contract.
 *
 * As of Track D / D0 the *interface* lives in `@game-hub/kernel` (`contracts/module.ts`), so a game can
 * one day ship as its own package and build against the same neutral contract the host does. This file
 * is now the thin backend-side binding: it pins the kernel contract's generic host parameters to the
 * backend's own concrete types (`ModuleContext`, `FastifyInstance`) and re-exports the rest verbatim.
 * The seam rules are unchanged — see the doc comments in `@game-hub/kernel`.
 *
 * **This file must never import a game.** It is the contract binding; each `games/<game>/` is one
 * implementation and the generated registry (`index.generated.ts`) is the lookup.
 *
 * ## The structural restatement retired here
 *
 * Before D0, this file **restated** `MoveRecord` and `Viewer` structurally — copies of the engine's
 * kernel types — precisely so the contract needn't import the engine (which shipped no neutral kernel
 * package to share). With a real `@game-hub/kernel`, that trick retires: the contract and the engine
 * now share the *same* `MoveRecord`/`Viewer` types directly, re-exported below.
 */

/** The backend's concrete module context: the kernel contract with its host bindings pinned. */
export type ModuleContext = KernelModuleContext<DB, GameHub, BotRepository>;

/**
 * The backend's concrete `GameModule`: the kernel contract with `Ctx`/`App` pinned to this host's
 * `ModuleContext` and Fastify. A module still writes `GameModule<State, Action>` exactly as before.
 */
export type GameModule<S, A> = KernelGameModule<S, A, ModuleContext, FastifyInstance>;

// The rest of the contract is host-neutral — shared directly from the kernel (including MoveRecord and
// Viewer, no longer restated here).
export type {
  BotDriver,
  ModuleGames,
  ModuleHub,
  ModuleBotSeats,
  ParseResult,
  ErrorResponse,
  GameSummary,
  MoveRecord,
  Viewer,
} from '@game-hub/kernel';

/**
 * Compile-time proof that the backend's concrete host classes satisfy the kernel's *structural* host
 * contracts (contract gap #2, decision 3). A game package binds `ModuleContext`'s `Hub`/`BotSeats`
 * generics to `ModuleHub`/`ModuleBotSeats` — it can't name `GameHub`/`BotRepository` without importing
 * the backend (a workspace cycle). These two aliases make any drift between a structural surface and
 * its concrete class a **type error here, in the host**: each defaults its type parameter to the
 * concrete class under the structural constraint, so if the class ever stops satisfying the contract
 * the default violates the constraint and this file fails to typecheck. Purely type-level, no runtime.
 */
type _AssertGameHubSatisfiesModuleHub<_T extends ModuleHub = GameHub> = void;
type _AssertBotRepositorySatisfiesModuleBotSeats<_T extends ModuleBotSeats = BotRepository> = void;
