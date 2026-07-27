import type { FastifyInstance } from 'fastify';
import type {
  GameModule as KernelGameModule,
  ModuleBotSeats,
  ModuleContext as KernelModuleContext,
  ModuleHub,
} from '@game-hub/kernel';

/**
 * The `GameModule` seam, bound for Can't Stop (Track D — legacy-migration phase 2).
 *
 * A game **package** can't name the backend's concrete `ModuleContext`/`GameHub`/`BotRepository` without
 * importing `@game-hub/backend` — a workspace cycle. So it binds the kernel contract's generic host
 * parameters to the kernel's *structural* host types instead (decision 3): `Hub`/`BotSeats` to
 * `ModuleHub`/`ModuleBotSeats`, `App` to Fastify. The backend proves its concrete `GameHub`/
 * `BotRepository` satisfy those structural surfaces (the compile-time assertion in
 * `backend/src/games/module.ts`), so this binding and the host stay in lockstep. Can't Stop opens no
 * table of its own, so the `Db` generic is left `unknown`.
 *
 * This is the package equivalent of the in-repo games importing their bound types from
 * `backend/src/games/module.ts` — the same pins, made from the neutral kernel side of the seam.
 */
export type ModuleContext = KernelModuleContext<unknown, ModuleHub, ModuleBotSeats>;

/** The backend's concrete `GameModule`, bound: kernel contract with this host's `Ctx`/`App` pinned. */
export type GameModule<S, A> = KernelGameModule<S, A, ModuleContext, FastifyInstance>;
