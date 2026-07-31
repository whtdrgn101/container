// Shared backend test helpers — the `tests/helpers.ts` convention the game engines use, brought to the
// backend suite so per-suite boilerplate (a fresh in-memory app, the seeded PRNG, the WS reader) lives
// in one place instead of being copy-pasted across files.

import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

// The canonical seeded PRNG. `mulberry32` ships on `@game-hub/kernel` since 1.2.0 (D2c finding §13), so
// the backend tests import it rather than hand-rolling a copy. ⚠️ This is the *canonical* variant; the
// `makeRng` helpers in stpetersburg/russianrailroads (and the copies this replaced in stoneage) are a
// deliberately separate, seed-verified matter — see ROADMAP's D2c mulberry32 follow-up note.
export { mulberry32 } from '@game-hub/kernel';

/** A fresh in-memory app + db, ready to inject against. Callers own closing the app in `afterEach`. */
export async function newApp(options: Omit<Parameters<typeof buildApp>[0], 'db'> = {}): Promise<{
  app: FastifyInstance;
  db: DB;
}> {
  const db = createDatabase(':memory:');
  const app = buildApp({ db, ...options });
  await app.ready(); // load plugins (registers @fastify/websocket's injectWS + upgrade handler)
  return { app, db };
}

/** The minimal WebSocket surface the injected client exposes (a pull-based reader is built on top). */
type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;

/**
 * Wrap an injected WebSocket in a pull-based reader: `next()` resolves with the next JSON message,
 * typed as `T`. Generic so each suite names the `game` shape it expects (the hub's `StateMessage.game`
 * is `unknown` by design — the transport hosts any game and must not know one game's shape).
 *
 * ⚠️ **Platform coordination frames (`presence`, `chat`) are skipped** so a suite asserting on a game's
 * `state`/`auction`/`rematch` sequence isn't disrupted by the always-on presence roster (pushed on every
 * subscribe/leave) or by chat. A test that *wants* those frames reads them with its own raw listener
 * (see `chat.test.ts`). This is the single point that keeps every game-suite WS test green under presence.
 */
export function wsReader<T>(socket: WsClient): () => Promise<T> {
  const queue: T[] = [];
  const pending: Array<(m: T) => void> = [];
  socket.on('message', (raw: unknown) => {
    const msg = JSON.parse(String(raw)) as T;
    const type = (msg as { type?: unknown }).type;
    if (type === 'presence' || type === 'chat') return; // platform frames — not what game suites assert on
    const resolve = pending.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  });
  return () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise<T>((r) => pending.push(r)));
}
