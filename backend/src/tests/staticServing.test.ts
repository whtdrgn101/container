import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * The production single-container serving path (`app.ts`'s `staticDir` branch): the backend serves the
 * built UI and falls back to `index.html` for non-API GETs so the SPA can route client-side.
 *
 * This path runs **only** when `staticDir` is set — i.e. only in the Docker image. The rest of the
 * suite boots `buildApp({ db })` with no static dir, and Playwright runs against the Vite dev server
 * with an `/api` proxy (the opposite configuration), so nothing else exercises it. Its sharp edge is
 * the `setNotFoundHandler` allowlist regex `/^\/(games|lobbies|health)\b/`: a top-level API route that
 * isn't in it is silently answered with `index.html` and a 200 — a health check passes while the UI
 * breaks. See REVIEW.md §2.4. These tests pin the contract so a dropped allowlist entry fails loudly.
 */
describe('static UI serving + SPA fallback', () => {
  let app: FastifyInstance;
  let db: DB;
  let dir: string;
  const INDEX_HTML = '<!doctype html><title>Game Hub</title><div id="root">app-shell</div>';

  beforeEach(async () => {
    db = createDatabase(':memory:');
    dir = mkdtempSync(join(tmpdir(), 'game-hub-static-'));
    writeFileSync(join(dir, 'index.html'), INDEX_HTML);
    app = buildApp({ db, staticDir: dir });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html for an unknown non-API GET (SPA client-side routing)', async () => {
    const res = await app.inject({ method: 'GET', url: '/some/deep/spa/route' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('app-shell');
  });

  it('serves the built index.html at the root', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('app-shell');
  });

  it('does NOT swallow API routes — an unknown game is a JSON 404, not the SPA shell', async () => {
    // The whole hazard: if the allowlist regex ever stops covering an API prefix, this returns
    // index.html with a 200 instead. Assert the API answers as itself.
    const res = await app.inject({ method: 'GET', url: '/games/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json().error.code).toBe('GAME_NOT_FOUND');
  });

  it('keeps every allowlisted API prefix JSON, never HTML', async () => {
    // `/games`, `/lobbies`, `/health` must each resolve to their route, not the SPA fallback. A
    // missing lobby is the notFoundHandler's own JSON path (no route matches `/lobbies/nope`).
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.json()).toEqual({ status: 'ok' });

    const games = await app.inject({ method: 'GET', url: '/games' });
    expect(games.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(games.json().games)).toBe(true);

    const lobby = await app.inject({ method: 'GET', url: '/lobbies/nope' });
    expect(lobby.statusCode).toBe(404);
    expect(lobby.json().error.code).toBe('LOBBY_NOT_FOUND');
  });

  it('does not SPA-fallback non-GET methods — an unknown POST is a JSON 404', async () => {
    const res = await app.inject({ method: 'POST', url: '/not/a/route' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
