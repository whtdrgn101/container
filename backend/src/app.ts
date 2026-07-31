import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import { LOBBY_SWEEP_INTERVAL_MS, OPEN_LOBBY_TTL_MS } from './lobbies';
import { BODY_LIMIT_BYTES, WS_HEARTBEAT_INTERVAL_MS } from './security';
import { buildServices } from './services';
import type { AppOptions } from './services';
import { registerAbandonRoutes } from './routes/abandon';
import { registerHealthRoutes } from './routes/health';
import { registerStreamRoutes } from './routes/stream';
import { registerGameRoutes } from './routes/games';
import { registerRematchRoutes } from './routes/rematch';
import { registerModuleRoutes } from './routes/modules';
import { registerLobbyRoutes } from './routes/lobbies';
import { registerStaticServing } from './routes/static';

export type { AppOptions } from './services';

/**
 * Build a Fastify instance wired to a database. Pure factory — no listening, easy to test.
 *
 * The core here is **game-agnostic by intent** (roadmap C0): it owns games, lobbies and the live
 * stream, and defers everything that is a *rule* — how to deal a game, what an action is, what an
 * error means, which seats a bot drives — to the `GameModule` for that game.
 *
 * This function is the **composition root**: it creates the Fastify app, builds the shared services
 * (`buildServices` — repositories + the game-lifecycle and error-reply helpers), and registers each
 * route concern (abandon, health, stream, games, rematch, module endpoints, lobbies, static) from its
 * own file under `routes/`. The split follows the same discipline C2 applied to `App.tsx`: one file
 * per concern behind a thin composition root, rather than one monolith that grows back.
 *
 * ⚠️ **Registration order matters in two places.** The abandon guard is a `preHandler` that Fastify
 * binds to routes at registration time, so it is registered **first**, ahead of every mutating route
 * it protects (`/actions`, rematch, the module endpoints). And the `@fastify/websocket` plugin must
 * be registered before the stream route that uses it — `registerStreamRoutes` owns both, so that pair
 * stays correct on its own.
 */
export function buildApp(options: AppOptions): FastifyInstance {
  // `bodyLimit` (§4.7): actions are tiny, so cap a hostile/oversized body well below Fastify's 1 MiB
  // default. An over-limit body is rejected with 413 before any handler runs.
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: BODY_LIMIT_BYTES });
  // Generous global per-IP rate limit (§4.7), opt-in so the test suites (which out-request any human,
  // and would trip `inject`) stay green. Registered with `global: false` and driven by our own
  // `onRequest` hook, added here **before any route** so Fastify applies it to all of them: the
  // plugin's own global hook is added only when it finishes loading (at `ready()`), by which point the
  // synchronously-registered routes below have already snapshotted their hooks and would miss it —
  // and `buildApp` is synchronous, so we can't `await` the registration first. The limiter middleware
  // (`app.rateLimit()`) is created lazily on the first request, once the plugin has decorated `app`.
  if (options.rateLimit) {
    void app.register(fastifyRateLimit, { ...options.rateLimit, global: false });
    // Wrap the decorator call so `ReturnType` sees a plain function (not a `this`-bound method).
    const makeLimiter = () => app.rateLimit();
    let limiter: ReturnType<typeof makeLimiter> | undefined;
    app.addHook('onRequest', async function (this: FastifyInstance, request, reply) {
      // `.call(this, …)` because the plugin's middleware is a `this`-bound Fastify hook.
      await (limiter ??= makeLimiter()).call(this, request, reply);
    });
  }

  const services = buildServices(app, options);

  // Reclaim never-started open lobbies so the table doesn't grow without bound on the persistent
  // volume (REVIEW §4.3). Nothing else ever deletes a lobby. Sweep once at boot, then on an interval
  // that is `unref`'d (so it never keeps the process — or a test's app — alive) and cleared on close.
  // Started lobbies are exempt: join-by-code still resolves them to their game.
  const sweepLobbies = (): void => {
    try {
      services.lobbies.deleteExpiredOpen(new Date(Date.now() - OPEN_LOBBY_TTL_MS).toISOString());
    } catch (error) {
      app.log.error({ err: error }, 'lobby sweep failed');
    }
  };
  sweepLobbies();
  const sweepTimer = setInterval(sweepLobbies, LOBBY_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
  app.addHook('onClose', async () => clearInterval(sweepTimer));

  // Reap half-open live-stream sockets (§4.7): ping every socket on an interval and terminate any that
  // stops answering, so a peer that vanished without a FIN can't sit in the hub — or against its per-IP
  // cap — forever. `unref`'d inside the hub; stopped on close.
  services.hub.startHeartbeat(WS_HEARTBEAT_INTERVAL_MS);
  app.addHook('onClose', async () => services.hub.stopHeartbeat());

  // Order-sensitive: the abandon guard's `preHandler` must be registered ahead of the mutating routes
  // it protects (see the ⚠️ note above).
  registerAbandonRoutes(app, services);
  registerHealthRoutes(app, services);
  registerStreamRoutes(app, services);
  registerGameRoutes(app, services);
  registerRematchRoutes(app, services);
  registerModuleRoutes(app, services);
  registerLobbyRoutes(app, services);

  if (options.staticDir) registerStaticServing(app, options.staticDir);

  return app;
}
