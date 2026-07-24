import { buildApp } from './app';
import { createDatabase } from './db';
import { DEFAULT_RATE_LIMIT } from './security';

const databasePath = process.env['DATABASE_PATH'] ?? 'game-hub.sqlite';
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';
// When set (production container), the server also serves the built UI from this directory.
const staticDir = process.env['UI_DIST'];
// Extra WS origins allowed beyond same-origin (§4.7) — a comma-separated list, e.g. for a reverse
// proxy (or a dev Vite proxy) fronting the socket under a different Host than the browser's Origin.
// Empty by default (same-origin only), which is what the single-container production deploy needs.
const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
// Per-IP rate-limit ceiling (§4.7), overridable so a deployment (or the e2e harness, which out-requests
// any human from a single IP) can raise it. Defaults to the generous production cap.
const rateLimitMax = Number(process.env['RATE_LIMIT_MAX'] ?? DEFAULT_RATE_LIMIT.max);

const db = createDatabase(databasePath);
// Production opts into the generous per-IP rate limit (§4.7); the in-process test suites leave it off.
const app = buildApp({
  db,
  logger: true,
  rateLimit: { max: rateLimitMax, timeWindow: DEFAULT_RATE_LIMIT.timeWindow },
  allowedOrigins,
  ...(staticDir ? { staticDir } : {}),
});

app.listen({ port, host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});

/**
 * Graceful shutdown. `docker stop` sends SIGTERM (then SIGKILL after a grace period); Ctrl-C sends
 * SIGINT. Without a handler the process is cut mid-request and the database handle is never closed —
 * WAL makes that crash-*safe*, but not clean (an open handle, an un-checkpointed `-wal`). Close the
 * Fastify server (drains in-flight requests, stops accepting new ones) and then the database.
 *
 * Guarded against double-fire: a second signal (or SIGINT arriving after SIGTERM) is ignored so
 * `app.close()` / `db.close()` run exactly once.
 */
let shuttingDown = false;
const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down: closing server and database');
  try {
    await app.close();
  } catch (error) {
    app.log.error(error);
  } finally {
    db.close();
  }
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
