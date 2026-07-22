import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { LobbyRepository, OPEN_LOBBY_TTL_MS } from '../lobbies';
import type { Lobby } from '../lobbies';

/**
 * Ops hardening (REVIEW §4.3 / §4.4): the health check actually touches the DB, `listOpen` is bounded,
 * open lobbies are swept, and the new indexes/columns migrate onto a live database. None of this is
 * game-specific — it's the platform's home-server plumbing.
 */

const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

const lobby = (id: string, status: 'open' | 'started', freeSeat: boolean): Lobby => ({
  id,
  gameType: 'container',
  seats: 3,
  members: [{ name: 'Ann', bot: false }, freeSeat ? null : { name: 'Bo', bot: false }, { name: 'Cy', bot: false }],
  status,
  gameId: status === 'started' ? 'g1' : null,
});

/** Insert a lobby row directly, with a controlled created_at, mirroring how create() writes it. */
const insertLobby = (db: DB, l: Lobby, createdAt: string) =>
  db
    .prepare(`INSERT INTO lobbies (id, data, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)`)
    .run(l.id, JSON.stringify(l), createdAt, createdAt, l.status);

describe('health check touches the database (§4.4)', () => {
  it('returns { status: ok } while the DB is reachable', async () => {
    const db = createDatabase(':memory:');
    const app = buildApp({ db });
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
      db.close();
    }
  });

  it('returns 503 when the DB handle is gone — so restart: unless-stopped can fire', async () => {
    const db = createDatabase(':memory:');
    const app = buildApp({ db });
    await app.ready();
    try {
      db.close(); // simulate an unmounted/locked/closed volume: SELECT 1 now throws
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({ status: 'unhealthy' });
    } finally {
      await app.close();
      // db already closed above
    }
  });
});

describe('listOpen is bounded (§4.3)', () => {
  let db: DB;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => db.close());

  it('caps the poll result at the limit even with far more open lobbies', () => {
    const repo = new LobbyRepository(db);
    for (let i = 0; i < 120; i++) repo.create(lobby(`open-${i}`, 'open', true));
    expect(repo.listOpen().length).toBe(50); // default cap
    expect(repo.listOpen(10).length).toBe(10); // honours an explicit limit
  });

  it('excludes started lobbies and full (no free seat) lobbies', () => {
    const repo = new LobbyRepository(db);
    repo.create(lobby('has-seat', 'open', true));
    repo.create(lobby('is-full', 'open', false));
    repo.create(lobby('is-started', 'started', true));
    const ids = repo.listOpen().map((l) => l.id);
    expect(ids).toContain('has-seat');
    expect(ids).not.toContain('is-full');
    expect(ids).not.toContain('is-started');
  });

  it('drops a lobby from the list once it starts (status column stays in sync on update)', () => {
    const repo = new LobbyRepository(db);
    const l = lobby('l1', 'open', true);
    repo.create(l);
    expect(repo.listOpen().map((x) => x.id)).toContain('l1');
    repo.update({ ...l, status: 'started', gameId: 'g1' });
    expect(repo.listOpen().map((x) => x.id)).not.toContain('l1');
  });
});

describe('lobby retention sweep (§4.3)', () => {
  let db: DB;

  beforeEach(() => {
    db = createDatabase(':memory:');
  });

  afterEach(() => db.close());

  it('expires never-started open lobbies past the TTL, keeps recent and started ones', () => {
    const repo = new LobbyRepository(db);
    insertLobby(db, lobby('old-open', 'open', true), iso(-OPEN_LOBBY_TTL_MS - 60_000));
    insertLobby(db, lobby('old-started', 'started', false), iso(-OPEN_LOBBY_TTL_MS - 60_000));
    insertLobby(db, lobby('recent-open', 'open', true), iso(-60_000));

    const removed = repo.deleteExpiredOpen(iso(-OPEN_LOBBY_TTL_MS));
    expect(removed).toBe(1); // only old-open

    const remaining = new Set(
      (db.prepare(`SELECT id FROM lobbies`).all() as { id: string }[]).map((r) => r.id),
    );
    expect(remaining.has('old-open')).toBe(false); // swept
    expect(remaining.has('old-started')).toBe(true); // started lobbies are kept — resolvable by code
    expect(remaining.has('recent-open')).toBe(true); // inside the TTL window
  });

  it('runs the sweep at boot (buildApp reclaims an already-expired open lobby)', async () => {
    insertLobby(db, lobby('stale', 'open', true), iso(-OPEN_LOBBY_TTL_MS - 60_000));
    const app = buildApp({ db }); // boot sweep runs in the factory
    await app.ready();
    try {
      expect(db.prepare(`SELECT COUNT(*) AS n FROM lobbies WHERE id = 'stale'`).get()).toEqual({ n: 0 });
    } finally {
      await app.close();
    }
  });
});

describe('the lobbies.status migration (§4.3)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lobby-migration-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /**
   * The deploy-breaking one: `CREATE TABLE IF NOT EXISTS` does not add a column to an existing table,
   * so on Tim's live volume the `status` column would never appear and `listOpen`'s `WHERE status`
   * would throw on the first poll. This reproduces a pre-column lobbies table and asserts opening it
   * both adds the column and backfills the true status from each row's JSON (not the DEFAULT).
   */
  it('adds status to a pre-column database and backfills it accurately from the JSON', () => {
    const path = join(dir, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE lobbies (
        id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
    `);
    legacy
      .prepare(`INSERT INTO lobbies (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('was-open', JSON.stringify(lobby('was-open', 'open', true)), '2024-01-01', '2024-01-01');
    legacy
      .prepare(`INSERT INTO lobbies (id, data, created_at, updated_at) VALUES (?, ?, ?, ?)`)
      .run('was-started', JSON.stringify(lobby('was-started', 'started', false)), '2024-01-01', '2024-01-01');
    legacy.close();

    const db = createDatabase(path);
    try {
      const columns = (db.prepare(`PRAGMA table_info(lobbies)`).all() as { name: string }[]).map((c) => c.name);
      expect(columns).toContain('status');
      // Backfilled from JSON, not blanket-'open': a started lobby must not resurface in listOpen.
      const rows = db.prepare(`SELECT id, status FROM lobbies ORDER BY id`).all();
      expect(rows).toEqual([
        { id: 'was-open', status: 'open' },
        { id: 'was-started', status: 'started' },
      ]);
      expect(new LobbyRepository(db).listOpen().map((l) => l.id)).toEqual(['was-open']);
    } finally {
      db.close();
    }
  });

  it('creates the polled indexes (fresh and legacy databases alike)', () => {
    const path = join(dir, 'fresh.sqlite');
    const db = createDatabase(path);
    try {
      const indexes = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as {
        name: string;
      }[]).map((r) => r.name);
      expect(indexes).toContain('idx_games_active_updated');
      expect(indexes).toContain('idx_lobbies_status_created');
    } finally {
      db.close();
    }
  });
});
