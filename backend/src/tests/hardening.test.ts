import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GameState } from '@game-hub/engine/container';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { containerModule } from '../games';
import { GameRepository, StaleVersionError } from '../repository';
import { isAllowedWsOrigin, WsConnectionLimiter, WS_MAX_CONNECTIONS_PER_IP } from '../security';

// Ops/security batch — REVIEW §4.2 (optimistic concurrency) + §4.7 (transport hardening). Kept out of
// the 1200-line app.test.ts monolith (which already breaks the repo's own size rule).

let app: FastifyInstance;
let db: DB;

beforeEach(async () => {
  db = createDatabase(':memory:');
  app = buildApp({ db });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

async function createGame(names = ['Ann', 'Bob', 'Cid']): Promise<GameState> {
  const response = await app.inject({
    method: 'POST',
    url: '/games',
    payload: { players: names.map((name) => ({ name })) },
  });
  expect(response.statusCode).toBe(201);
  return response.json().game as GameState;
}

const act = (gameId: string, playerId: string, action: unknown, expectedVersion?: number) =>
  app.inject({
    method: 'POST',
    url: `/games/${gameId}/actions`,
    payload: { playerId, action, ...(expectedVersion !== undefined ? { expectedVersion } : {}) },
  });

// ─────────────────────────────── §4.2 Optimistic concurrency ───────────────────────────────

describe('§4.2 optimistic concurrency', () => {
  it('rejects an action posted against a stale version with 409 STALE_VERSION', async () => {
    const game = await createGame();
    expect(game.version).toBe(0);

    // The client thinks the game is at v5; it is at v0. Refuse rather than apply blind.
    const response = await act(game.id, 'p1', { type: 'PRODUCE' }, 5);
    expect(response.statusCode).toBe(409);
    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('STALE_VERSION');
    // The current version is reported so the client can reconcile.
    expect(body.error.message).toContain('version 0');
  });

  it('applies an action whose expectedVersion is current, then rejects a replay of it', async () => {
    const game = await createGame();

    // First submit at the version we saw (v0) succeeds and bumps to v1.
    const first = await act(game.id, 'p1', { type: 'PRODUCE' }, 0);
    expect(first.statusCode).toBe(200);
    expect((first.json().game as GameState).version).toBe(1);

    // A double-click / retry re-posts the SAME move still believing it's v0 — now stale, so refused.
    const replay = await act(game.id, 'p1', { type: 'PRODUCE' }, 0);
    expect(replay.statusCode).toBe(409);
    expect((replay.json() as { error: { code: string } }).error.code).toBe('STALE_VERSION');
  });

  it('applies unconditionally when expectedVersion is omitted (backward compatible)', async () => {
    const game = await createGame();
    const response = await act(game.id, 'p1', { type: 'PRODUCE' }); // no expectedVersion
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).version).toBe(1);
  });

  it('maps the repository WHERE-version backstop firing to 409 STALE_VERSION', async () => {
    // The handler is synchronous end-to-end, so the WHERE-version guard can only lose a race if an
    // `await` is ever added. Force that outcome directly: make the guarded write throw, and assert the
    // handler catches it as STALE_VERSION rather than a 500 — the same contract as the pre-check.
    const game = await createGame();
    const spy = vi.spyOn(GameRepository.prototype, 'update').mockImplementationOnce(() => {
      throw new StaleVersionError(game.id, 0);
    });
    const response = await act(game.id, 'p1', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('STALE_VERSION');
    spy.mockRestore();
  });

  it('guards GameRepository.update WHERE version and throws on a lost update', async () => {
    const game = await createGame();
    const repo = new GameRepository(db);
    const state = repo.get(containerModule, game.id);
    // The row is at v0; claim it is at v999 → zero rows match → StaleVersionError, no overwrite.
    expect(() => repo.update(containerModule, state, 999)).toThrow(StaleVersionError);
  });

  it('updates unconditionally (module pass-through) when expectedVersion is omitted', async () => {
    const game = await createGame();
    const repo = new GameRepository(db);
    const state = repo.get(containerModule, game.id) as GameState;
    // No expectedVersion → unconditional overwrite (what ModuleGames.update and the bot runner use).
    expect(() => repo.update(containerModule, state)).not.toThrow();
  });
});

// ─────────────────────────────── §4.7 Rate limiting ───────────────────────────────

describe('§4.7 rate limiting', () => {
  it('returns 429 once the per-IP cap is exceeded when enabled', async () => {
    const limitedDb = createDatabase(':memory:');
    const limited = buildApp({ db: limitedDb, rateLimit: { max: 2, timeWindow: 60_000 } });
    await limited.ready();
    try {
      expect((await limited.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      expect((await limited.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
      // Third within the window trips the limiter.
      expect((await limited.inject({ method: 'GET', url: '/health' })).statusCode).toBe(429);
    } finally {
      await limited.close();
      limitedDb.close();
    }
  });

  it('is disabled by default, so the suites never trip it', async () => {
    // The default app (no rateLimit option) serves far more than any cap without a 429.
    for (let i = 0; i < 20; i++) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
  });
});

// ─────────────────────────────── §4.7 WS origin + hygiene ───────────────────────────────

describe('§4.7 WebSocket origin check', () => {
  it('isAllowedWsOrigin allows same-origin, no-Origin, and allowlisted; refuses others', () => {
    // No Origin at all — a non-browser client (tests, CLI). Allowed.
    expect(isAllowedWsOrigin(undefined, 'game.lan', [])).toBe(true);
    // Same-origin: Origin host equals Host.
    expect(isAllowedWsOrigin('http://game.lan', 'game.lan', [])).toBe(true);
    expect(isAllowedWsOrigin('https://game.lan:8080', 'game.lan:8080', [])).toBe(true);
    // Cross-origin, not allowlisted → refused.
    expect(isAllowedWsOrigin('http://evil.example', 'game.lan', [])).toBe(false);
    // Allowlisted by full origin or by bare host.
    expect(isAllowedWsOrigin('http://proxy.lan', 'game.lan', ['http://proxy.lan'])).toBe(true);
    expect(isAllowedWsOrigin('http://proxy.lan', 'game.lan', ['proxy.lan'])).toBe(true);
    // A malformed Origin is refused, not trusted.
    expect(isAllowedWsOrigin('not a url', 'game.lan', [])).toBe(false);
  });

  it('refuses a cross-origin upgrade on the live stream (1008)', async () => {
    const game = await createGame();
    const socket = await app.injectWS(`/games/${game.id}/stream`, {
      headers: { origin: 'http://evil.example', host: 'game.lan' },
    });
    const [code] = (await once(socket, 'close')) as [number];
    expect(code).toBe(1008);
  });

  it('accepts a same-origin upgrade', async () => {
    const game = await createGame();
    const socket = await app.injectWS(`/games/${game.id}/stream`, {
      headers: { origin: 'http://game.lan', host: 'game.lan' },
    });
    // A same-origin socket is not closed for the origin reason; it receives the initial snapshot.
    const message = (await new Promise<string>((resolve) => {
      socket.on('message', (raw: unknown) => resolve(String(raw)));
    })) as string;
    expect((JSON.parse(message) as { type: string }).type).toBe('state');
    socket.close();
  });

  it('caps concurrent connections per IP (1013 once over the limit)', async () => {
    const game = await createGame();
    const sockets: Awaited<ReturnType<FastifyInstance['injectWS']>>[] = [];
    // Open exactly the cap — all share 127.0.0.1 under injectWS.
    for (let i = 0; i < WS_MAX_CONNECTIONS_PER_IP; i++) {
      sockets.push(await app.injectWS(`/games/${game.id}/stream`));
    }
    // One more from the same IP is refused with Try-Again-Later.
    const overflow = await app.injectWS(`/games/${game.id}/stream`);
    const [code] = (await once(overflow, 'close')) as [number];
    expect(code).toBe(1013);
    for (const socket of sockets) socket.close();
  });
});

describe('§4.7 WsConnectionLimiter', () => {
  it('acquires up to the cap, refuses beyond it, and releases', () => {
    const limiter = new WsConnectionLimiter(2);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.countFor('a')).toBe(2);
    expect(limiter.tryAcquire('a')).toBe(false); // at cap
    // A different IP has its own budget.
    expect(limiter.tryAcquire('b')).toBe(true);
    // Releasing frees a slot; dropping to zero removes the key.
    limiter.release('a');
    expect(limiter.countFor('a')).toBe(1);
    expect(limiter.tryAcquire('a')).toBe(true);
    limiter.release('b');
    expect(limiter.countFor('b')).toBe(0);
    // Release below zero is a no-op (never negative).
    limiter.release('b');
    expect(limiter.countFor('b')).toBe(0);
  });
});

// ─────────────────────────────── §4.7 Input bounds ───────────────────────────────

describe('§4.7 input bounds', () => {
  it('rejects an over-long player name (maxLength 64)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'x'.repeat(65) }, { name: 'Bob' }, { name: 'Cid' }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects too many players (maxItems)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: Array.from({ length: 9 }, (_, i) => ({ name: `P${i}` })) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an over-long gameType', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'g'.repeat(65), players: [{ name: 'Ann' }] },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an over-long lobby join name', async () => {
    const created = await app.inject({ method: 'POST', url: '/lobbies', payload: {} });
    const lobby = created.json().lobby as { id: string };
    const response = await app.inject({
      method: 'POST',
      url: `/lobbies/${lobby.id}/join`,
      payload: { name: 'y'.repeat(65) },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects a body over the explicit bodyLimit with 413', async () => {
    const huge = 'z'.repeat(300 * 1024); // > 256 KiB
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }], filler: huge },
    });
    expect(response.statusCode).toBe(413);
  });
});
