// Honest boot-proof for the esbuild bundle (backend/dist/server.js).
//
// The bundle inlines the workspace TS deps (@game-hub/kernel + the game packages) and leaves the native
// better-sqlite3 external, so the only way to know it actually runs is to run it: spawn the real
// `node dist/server.js`, hit `/health` (which does a real `SELECT 1`), and create a game over REST.
// Runs in the Dockerfile build stage — if the bundle is broken (a missing external, a require() that
// escaped inlining, an ESM/CJS interop bug), the image fails to build instead of crash-looping in prod.
//
// Usage: node backend/scripts/smoke.mjs [path-to-server.js]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const serverPath = process.argv[2] ?? 'dist/server.js';
const port = 3000 + Math.floor(Math.random() * 4000);
const dir = mkdtempSync(join(tmpdir(), 'gamehub-smoke-'));

const child = spawn(process.execPath, [serverPath], {
  env: {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATABASE_PATH: join(dir, 'smoke.sqlite'),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const base = `http://127.0.0.1:${port}`;

const fail = (msg) => {
  console.error(`SMOKE FAILED: ${msg}`);
  child.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
};

const waitForHealth = async () => {
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  fail('server never became healthy on /health');
};

try {
  await waitForHealth();

  const created = await fetch(`${base}/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      gameType: 'container',
      players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    }),
  });
  if (created.status !== 201) fail(`POST /games returned ${created.status}, expected 201`);
  const body = await created.json();
  if (!body?.game?.id) fail('POST /games response had no game.id');

  const fetched = await fetch(`${base}/games/${body.game.id}`);
  if (!fetched.ok) fail(`GET /games/:id returned ${fetched.status}`);

  console.log('SMOKE OK: /health up, game created and fetched over REST');
} finally {
  child.kill('SIGTERM');
  rmSync(dir, { recursive: true, force: true });
}
process.exit(0);
