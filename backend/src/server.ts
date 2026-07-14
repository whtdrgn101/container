import { buildApp } from './app';
import { createDatabase } from './db';

const databasePath = process.env['DATABASE_PATH'] ?? 'container.sqlite';
const port = Number(process.env['PORT'] ?? 3001);
const host = process.env['HOST'] ?? '0.0.0.0';

const db = createDatabase(databasePath);
const app = buildApp({ db, logger: true });

app.listen({ port, host }).catch((error: unknown) => {
  app.log.error(error);
  process.exit(1);
});
