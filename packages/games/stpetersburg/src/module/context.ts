import type {
  GameModule as KernelGameModule,
  ModuleBotSeats,
  ModuleContext as KernelModuleContext,
  ModuleHub,
} from '@game-hub/kernel';

/**
 * The `GameModule` seam, bound for Saint Petersburg (Track D — legacy-migration phase 4).
 *
 * A game **package** can't name the backend's concrete `ModuleContext`/`GameHub`/`BotRepository` without
 * importing `@game-hub/backend` — a workspace cycle. So it binds the kernel contract's generic host
 * parameters to the kernel's *structural* host types instead (decision 3): `Hub`/`BotSeats` to
 * `ModuleHub`/`ModuleBotSeats`. The backend proves its concrete `GameHub`/`BotRepository` satisfy those
 * structural surfaces (the compile-time assertion in `backend/src/games/module.ts`), so this binding and
 * the host stay in lockstep. Saint Petersburg opens no table of its own, so the `Db` generic is left
 * `unknown`.
 *
 * **The routeless variant of the recipe:** unlike Can't Stop / Stone Age, this module has **no `routes.ts`**
 * — no server-only actions and no dice (its randomness is `createGame` + per-refill draws inside pure
 * engine actions). Nothing here imports Fastify, so the `App` generic is left at its `unknown` default
 * rather than pinned to `FastifyInstance`, and the package adds no `fastify` devDependency. `routes` is
 * optional on `GameModule`, and a module with `App = unknown` still satisfies the backend registry's
 * `App = FastifyInstance` slot (function-parameter contravariance).
 *
 * This is the package equivalent of the in-repo games importing their bound types from
 * `backend/src/games/module.ts` — the same pins, made from the neutral kernel side of the seam.
 */
export type ModuleContext = KernelModuleContext<unknown, ModuleHub, ModuleBotSeats>;

/** The backend's concrete `GameModule`, bound: kernel contract with this host's `Ctx` pinned (no `App`). */
export type GameModule<S, A> = KernelGameModule<S, A, ModuleContext>;
