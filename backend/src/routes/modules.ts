import type { FastifyInstance } from 'fastify';
import type { BotDriver, ModuleContext } from '../games';
import { SchemaUnsupportedError } from '../repository';
import type { AppServices } from '../services';

/**
 * Give every registered game its context, its AI driver, and its own endpoints — Container's delivery
 * auction being the one that exists. The core knows nothing about what those routes do; each module's
 * routes live under `/games/:id/<gameType>/…` behind a scope guard that refuses another game's rows.
 */
export function registerModuleRoutes(app: FastifyInstance, services: AppServices): void {
  const { registry, repo, db, botSeats, hub, rng, pushGame, colorsFor, drivers, contexts, noBots } = services;
  const { notFound, wrongType, schemaUnsupported } = services;

  for (const info of registry.list()) {
    const module = registry.require(info.id);
    const ctx: ModuleContext = {
      db,
      // Bound to this module, so it can persist its own state without naming itself.
      games: {
        get: (gameId) => repo.get(module, gameId),
        // Unconditional overwrite (no `expectedVersion`): a module route re-reads and re-applies inside
        // one synchronous span (Container's auction resolve, Can't Stop / Stone Age roll), so there is
        // no interleaving window the version guard would protect — and adding it would only invent a
        // false-conflict failure mode. The core's `/actions` handler is the one that threads the guard.
        update: (state) => repo.update(module, state),
      },
      botSeats,
      hub,
      rng,
      pushGame,
      // A getter, because the driver below is built *from* this context.
      get bots(): BotDriver {
        return drivers.get(module.id) ?? noBots;
      },
      colorsFor: (gameId, state) => colorsFor(module, gameId, state),
    };
    contexts.set(module.id, ctx);
    const driver = module.createBotDriver?.(ctx);
    if (driver) drivers.set(module.id, driver);

    /**
     * Each game's routes live under `/games/:id/<gameType>/…`, so a module declares paths relative to
     * that (Container's `routes.ts` registers `/auction`, serving `/games/:id/container/auction`).
     *
     * Namespacing is about **correctness, not just collisions**. Unprefixed, two games both wanting an
     * `/auction` endpoint would be a Fastify duplicate-route crash at boot — but worse, whichever
     * registered first would then be handed *every* game's auction requests, including games it has no
     * business interpreting. Auctions are common in board games; this is a when-not-if problem.
     *
     * The guard closes the other half: a prefix is just a URL, and nothing stops a client asking for
     * `/games/<a-chess-game>/container/auction`. Refusing anything whose row isn't this module's type
     * means a module can only ever be handed its own states — the same guarantee `moduleFor` gives the
     * core routes.
     */
    app.register(
      async (scope) => {
        scope.addHook('preHandler', async (request, reply) => {
          const gameId = (request.params as { id?: string }).id;
          if (gameId === undefined) return;
          if (!repo.exists(gameId)) return notFound(reply, gameId);
          if (repo.typeOf(gameId) !== module.id) return wrongType(reply, gameId, module.id);
          // Migrate on the module-route path too (only *after* the type guard, so a wrong-type row is
          // never handed to this module), and refuse a row from a newer server rather than 500.
          try {
            repo.get(module, gameId);
          } catch (error) {
            if (error instanceof SchemaUnsupportedError) return schemaUnsupported(reply, gameId);
            throw error;
          }
        });
        module.routes?.(scope, ctx);
      },
      { prefix: `/games/:id/${module.id}` },
    );
  }
}
