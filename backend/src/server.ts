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
