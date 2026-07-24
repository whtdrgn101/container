import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { GameRepository } from '../repository';

/**
 * Abandoning a game (soft delete).
 *
 * Note what is *not* here: any Container knowledge. Abandonment is a platform concern — it needs to
 * know nothing about containers, bids or seats — so it lives entirely in the game-agnostic core and
 * every future game gets it for free. If a test here ever needs `@game-hub/engine`, that's a sign
 * the feature leaked into the wrong side of the C0 seam.
 */
describe('abandoning a game', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const createGame = async (players = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }]) => {
    const response = await app.inject({ method: 'POST', url: '/games', payload: { players } });
    expect(response.statusCode).toBe(201);
    return response.json().game.id as string;
  };

  const listedIds = async () => {
    const response = await app.inject({ method: 'GET', url: '/games' });
    return (response.json().games as { id: string }[]).map((game) => game.id);
  };

  it('drops the game from the in-progress list', async () => {
    const id = await createGame();
    expect(await listedIds()).toContain(id);

    const response = await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ abandoned: true });
    expect(await listedIds()).not.toContain(id);
  });

  // Soft, not hard: the row survives for audit and replay, and a mis-click is undoable.
  it('keeps the game readable, and its move log intact', async () => {
    const id = await createGame();
    const before = await app.inject({ method: 'GET', url: `/games/${id}` });
    const movesBefore = new GameRepository(db).listMoves(id);
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });

    const after = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().game.id).toBe(id);
    expect(after.json().abandoned).toBe(true);
    expect(before.json().game.version).toBe(after.json().game.version);
    // The log is untouched by abandonment — same entries, same order, not merely "≥ 0" (which every
    // array satisfies). Comparing the whole array is what actually asserts "intact".
    expect(new GameRepository(db).listMoves(id)).toEqual(movesBefore);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM games WHERE id = ?`).get(id)).toEqual({ n: 1 });
  });

  it('is not scored — an unfinished game has no winner', async () => {
    const id = await createGame();
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    const game = (await app.inject({ method: 'GET', url: `/games/${id}` })).json().game;
    // `status: 'ended'` means the supply ran out and finalScoring ran. Abandoning must not claim that,
    // and must not invent a winner for a game nobody finished.
    expect(game.status).toBe('active');
    expect(game.results ?? []).toEqual([]);
    expect(game.winnerIds ?? []).toEqual([]);
  });

  it('refuses further actions with 409, not 404 — the game exists, it just cannot be played', async () => {
    const id = await createGame();
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });

    const response = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'END_TURN' } },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('GAME_ABANDONED');
  });

  // The module registers its own mutating endpoints, which would sail straight past a check that
  // only /actions did. The core's preHandler is what covers them without the module knowing.
  it("refuses a module's own mutating routes too", async () => {
    const id = await createGame();
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });

    for (const url of [`/games/${id}/container/auction/bids`, `/games/${id}/container/auction/resolve`]) {
      const response = await app.inject({ method: 'POST', url, payload: { playerId: 'p2', bid: 1 } });
      expect(response.statusCode, url).toBe(409);
      expect(response.json().error.code, url).toBe('GAME_ABANDONED');
    }
  });

  it('is idempotent, so a double-click or a retry is harmless', async () => {
    const id = await createGame();
    const first = await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    const second = await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
  });

  it('records when it was first abandoned, and a second call does not re-stamp it', async () => {
    const id = await createGame();
    const repo = new GameRepository(db);
    repo.abandon(id, '2020-01-01T00:00:00.000Z');
    repo.abandon(id, '2030-01-01T00:00:00.000Z');
    expect(db.prepare(`SELECT abandoned_at FROM games WHERE id = ?`).get(id)).toEqual({
      abandoned_at: '2020-01-01T00:00:00.000Z',
    });
  });

  it('404s for a game that never existed', async () => {
    const response = await app.inject({ method: 'POST', url: '/games/nope/abandon' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('GAME_NOT_FOUND');
  });

  it('tells connected clients, so a watcher finds out before its next move is refused', async () => {
    const id = await createGame();
    const socket = await app.injectWS(`/games/${id}/stream`);
    await new Promise((resolve) => setTimeout(resolve, 20)); // the initial snapshot
    const seen: unknown[] = [];
    socket.on('message', (data: Buffer) => seen.push(JSON.parse(data.toString())));

    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await socket.terminate();

    expect(seen).toContainEqual({ type: 'abandoned', gameId: id });
  });

  // Bots run server-side and are ticked on reads as well as writes. Without a gate, an abandoned
  // game's AI seats would keep playing it forever — the one way a soft-deleted game could still move.
  it('stops the bots: an all-bot game does not advance once abandoned', async () => {
    const id = await createGame([
      { name: 'Ann', bot: true },
      { name: 'Bo', bot: true },
      { name: 'Cy', bot: true },
    ] as { name: string; bot?: boolean }[]);
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });

    const versionOf = async () => (await app.inject({ method: 'GET', url: `/games/${id}` })).json().game.version;
    const before = await versionOf();
    // Several reads: each one ticks, so an ungated game would visibly run on.
    await versionOf();
    await versionOf();
    expect(await versionOf()).toBe(before);
  });
});

describe('the abandoned_at migration', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'container-migration-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * The one that would break a real deployment. `CREATE TABLE IF NOT EXISTS` does not alter an
   * existing table, so on Tim's already-deployed database the new column would simply never appear
   * and the first query naming it would throw. This reproduces that database — a `games` table from
   * before the column existed — and asserts opening it brings it up to date without losing the game.
   */
  it('adds the column to a database created before it existed, keeping its rows', () => {
    const path = join(dir, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE games (
        id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO games (id, state, version, created_at, updated_at)
      VALUES ('old', '{"id":"old"}', 3, '2024-01-01', '2024-01-01');
    `);
    legacy.close();

    const db = createDatabase(path);
    const columns = (db.prepare(`PRAGMA table_info(games)`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('abandoned_at');
    // Both added columns must appear, not just `abandoned_at`: the legacy DDL above omits `game_type`
    // too, and without it `moduleOf` (which reads `game_type` on the very first request) throws on
    // every deployed database. Asserting only one column let a dropped `game_type` migration pass.
    expect(columns).toContain('game_type');
    // `schema_version` (REVIEW §4.1) migrates in on the same pass, the same way `game_type` does: the
    // legacy DDL predates it, so a deployed database only grows it on open. Assert BOTH the column and
    // its backfilled value — a pre-column row is v1 by definition (the only shape there ever was), and
    // asserting only the column's presence would let a dropped DEFAULT slip through (the game_type lesson).
    expect(columns).toContain('schema_version');
    // The pre-existing game survives, un-abandoned, and is listable — backfilled to the game it could
    // only have been, and stamped at the shape it could only have been saved at.
    expect(db.prepare(`SELECT abandoned_at, game_type, schema_version FROM games WHERE id = 'old'`).get()).toEqual({
      abandoned_at: null,
      game_type: 'container',
      schema_version: 1,
    });
    expect(new GameRepository(db).isAbandoned('old')).toBe(false);
    expect(new GameRepository(db).typeOf('old')).toBe('container');
    db.close();
  });

  it('is a no-op on a fresh database, and safe to run twice', () => {
    const path = join(dir, 'fresh.sqlite');
    createDatabase(path).close();
    const db = createDatabase(path); // opens again — the migration must not fail on a second pass
    const columns = (db.prepare(`PRAGMA table_info(games)`).all() as { name: string }[]).map((c) => c.name);
    expect(columns.filter((name) => name === 'abandoned_at')).toHaveLength(1);
    db.close();
  });
});
