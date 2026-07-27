import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import type {
  GameModule as KernelGameModule,
  ModuleBotSeats,
  ModuleContext as KernelModuleContext,
  ModuleHub,
} from '@game-hub/kernel';

/**
 * The `GameModule` seam, bound for Container (Track D — legacy-migration phase 5).
 *
 * A game **package** can't name the backend's concrete `ModuleContext`/`GameHub`/`BotRepository` without
 * importing `@game-hub/backend` — a workspace cycle. So it binds the kernel contract's generic host
 * parameters to the kernel's *structural* host types instead (decision 3): `Hub`/`BotSeats` to
 * `ModuleHub`/`ModuleBotSeats`, `App` to Fastify. The backend proves its concrete `GameHub`/
 * `BotRepository` satisfy those structural surfaces (the compile-time assertion in
 * `backend/src/games/module.ts`), so this binding and the host stay in lockstep.
 *
 * **Unlike the other three games, Container binds the `Db` generic.** Its delivery-auction record is
 * coordination state that lives outside the engine (`auctions.ts`), persisted in a `delivery_auctions`
 * table it opens off `ctx.db`. That is the host's better-sqlite3 `Database`; the kernel stays host-free,
 * so the concrete binding lives here, in the package, behind a type-only `better-sqlite3` devDependency.
 *
 * This is the package equivalent of the in-repo games importing their bound types from
 * `backend/src/games/module.ts` — the same pins, made from the neutral kernel side of the seam.
 */
export type Db = Database;

export type ModuleContext = KernelModuleContext<Db, ModuleHub, ModuleBotSeats>;

/** The backend's concrete `GameModule`, bound: kernel contract with this host's `Ctx`/`App` pinned. */
export type GameModule<S, A> = KernelGameModule<S, A, ModuleContext, FastifyInstance>;
