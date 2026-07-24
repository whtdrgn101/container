import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { BotRepository } from '../bots';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Can't Stop bot difficulty tiers (CS4).
 *
 * Difficulty is coordination state, exactly like which seats are bots: a `game_bots.difficulty` column
 * the engine never learns about. The wire `bots` payload stays `string[]` (backward compatible); the
 * tier travels beside it. Only Can't Stop declares tiers, so the picker and validation appear only for
 * it — every other game is untouched. These focused tests cover the migration, the catalog contract,
 * per-seat validation on both entry points, storage, and that the runner reads the stored tier.
 */
describe('bot difficulty', () => {
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

  const createCantStop = (players: { name: string; bot?: boolean; difficulty?: string }[]) =>
    app.inject({ method: 'POST', url: '/games', payload: { gameType: 'cantstop', players } });

  describe('catalog', () => {
    it('publishes Can’t Stop’s tiers and leaves other games without the field', async () => {
      const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
        id: string;
        botDifficulties?: string[];
      }[];
      const byId = Object.fromEntries(catalog.map((g) => [g.id, g.botDifficulties]));
      expect(byId.cantstop).toEqual(['easy', 'normal', 'hard']);
      // A game that declares none must have no `botDifficulties` key at all, so the UI shows no picker.
      expect('botDifficulties' in (catalog.find((g) => g.id === 'container') ?? {})).toBe(false);
    });
  });

  describe('POST /games', () => {
    it('stores a valid per-seat difficulty beside the game (bots payload stays ids-only)', async () => {
      const response = await createCantStop([{ name: 'Human' }, { name: 'Bot', bot: true, difficulty: 'hard' }]);
      expect(response.statusCode).toBe(201);
      // The wire shape is unchanged — just the ids.
      expect(response.json().bots).toEqual(['p2']);
      const gameId = response.json().game.id as string;
      expect(new BotRepository(db).difficultiesForGame(gameId)).toEqual({ p2: 'hard' });
    });

    it('defaults an unspecified bot seat to normal', async () => {
      const response = await createCantStop([{ name: 'Human' }, { name: 'Bot', bot: true }]);
      const gameId = response.json().game.id as string;
      expect(new BotRepository(db).difficultiesForGame(gameId)).toEqual({ p2: 'normal' });
    });

    it('rejects a tier that isn’t one the game declares (400 INVALID_DIFFICULTY)', async () => {
      const response = await createCantStop([{ name: 'Human' }, { name: 'Bot', bot: true, difficulty: 'nightmare' }]);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_DIFFICULTY');
    });

    it('rejects a difficulty on a non-bot seat (400 INVALID_DIFFICULTY)', async () => {
      const response = await createCantStop([
        { name: 'Human', difficulty: 'easy' },
        { name: 'Bot', bot: true },
      ]);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_DIFFICULTY');
    });

    it('rejects any difficulty for a game that declares no tiers (Container)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: {
          gameType: 'container',
          players: [{ name: 'A' }, { name: 'B' }, { name: 'C', bot: true, difficulty: 'hard' }],
        },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_DIFFICULTY');
    });
  });

  describe('lobby join', () => {
    const openLobby = async () =>
      (await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 2, gameType: 'cantstop' } })).json().lobby
        .id as string;

    it('claims a bot seat at a chosen tier and carries it into the started game', async () => {
      const id = await openLobby();
      await app.inject({ method: 'POST', url: `/lobbies/${id}/join`, payload: { name: 'Human' } });
      const joined = await app.inject({
        method: 'POST',
        url: `/lobbies/${id}/join`,
        payload: { name: 'Bot', bot: true, difficulty: 'hard' },
      });
      expect(joined.statusCode).toBe(200);
      expect(joined.json().lobby.members[1].difficulty).toBe('hard');

      const started = await app.inject({ method: 'POST', url: `/lobbies/${id}/start` });
      const gameId = started.json().game.id as string;
      expect(new BotRepository(db).difficultiesForGame(gameId)).toEqual({ p2: 'hard' });
    });

    it('rejects a bad tier on join (400 INVALID_DIFFICULTY)', async () => {
      const id = await openLobby();
      const joined = await app.inject({
        method: 'POST',
        url: `/lobbies/${id}/join`,
        payload: { name: 'Bot', bot: true, difficulty: 'nope' },
      });
      expect(joined.statusCode).toBe(400);
      expect(joined.json().error.code).toBe('INVALID_DIFFICULTY');
    });

    it('rejects a tier on a human lobby seat', async () => {
      const id = await openLobby();
      const joined = await app.inject({
        method: 'POST',
        url: `/lobbies/${id}/join`,
        payload: { name: 'Human', difficulty: 'easy' },
      });
      expect(joined.statusCode).toBe(400);
      expect(joined.json().error.code).toBe('INVALID_DIFFICULTY');
    });
  });

  describe('the runner reads the stored tier', () => {
    it('plays a bot seat forward at its stored difficulty (an easy bot still finishes a game)', async () => {
      // Two easy bots — the point is that a non-default tier flows all the way to `decide` and the game
      // still plays itself out server-side (strength isn't asserted here; the bench proves ordering).
      const response = await createCantStop([
        { name: 'Ann', bot: true, difficulty: 'easy' },
        { name: 'Bob', bot: true, difficulty: 'easy' },
      ]);
      expect(response.statusCode).toBe(201);
      const game = response.json().game;
      expect(game.status).toBe('ended');
      expect(game.winnerIds).toHaveLength(1);
    });
  });
});

describe('the game_bots.difficulty migration', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'container-botdiff-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * The game_type lesson (see the abandoned_at migration): `CREATE TABLE IF NOT EXISTS` does not alter
   * an existing table, so an already-deployed database — a `game_bots` table from before the column
   * existed — would never grow `difficulty`, and the first query naming it would throw. Reproduce that
   * database and assert opening it adds the column AND backfills existing bot seats to 'normal' — the
   * only behaviour there was before tiers. Assert the value, not just the column: a dropped DEFAULT
   * would leave the tier NULL and slip past a presence-only check.
   */
  it('adds the column to a pre-tier database and backfills existing bot seats to normal', () => {
    const path = join(dir, 'legacy.sqlite');
    const legacy = new Database(path);
    legacy.exec(`
      CREATE TABLE game_bots (
        game_id TEXT NOT NULL, player_id TEXT NOT NULL,
        PRIMARY KEY (game_id, player_id)
      );
      INSERT INTO game_bots (game_id, player_id) VALUES ('old', 'p2');
    `);
    legacy.close();

    const db = createDatabase(path);
    const columns = (db.prepare(`PRAGMA table_info(game_bots)`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain('difficulty');
    // The backfilled row plays 'normal' — assert the column AND its value (the game_type lesson).
    expect(new BotRepository(db).difficultiesForGame('old')).toEqual({ p2: 'normal' });
    // The ids-only listing is unchanged, so the wire `bots` payload stays backward compatible.
    expect(new BotRepository(db).listForGame('old')).toEqual(['p2']);
    db.close();
  });
});
