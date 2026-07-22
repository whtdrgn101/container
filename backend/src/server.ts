import { buildApp } from './app';
import { createDatabase } from './db';

const databasePath = process.env['DATABASE_PATH'] ?? 'game-hub.sqlite';
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';
// When set (production container), the server also serves the built UI from this directory.
const staticDir = process.env['UI_DIST'];

const db = createDatabase(databasePath);
const app = buildApp({ db, logger: true, ...(staticDir ? { staticDir } : {}) });

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
