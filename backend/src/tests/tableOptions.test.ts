import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { GameRegistry } from '../games';
import type { GameModule } from '../games';

/**
 * **Table options** (kernel 1.5.0) — the channel a game uses to offer rule variants a table picks
 * before the deal, end-to-end through the core.
 *
 * This file exists for the same reason `module-seam.test.ts` does: none of the seven *real* hosted
 * games declares an option (they all predate the feature), so only a stub can observe that the picks
 * actually reach `createGame`. A test written against a real game would pass just as well if the host
 * silently dropped the record on the floor — which is precisely the bug worth catching, because the
 * symptom is a setup form that appears to work and a game dealt with the wrong rules.
 *
 * The stub is the counter from the seam test with two options bolted on, one of each declared type,
 * and a `dealtWith` field that records exactly what the host handed it.
 */

interface CounterState {
  id: string;
  count: number;
  /** What the host resolved and passed as `createGame`'s `options` — the thing under test. */
  dealtWith: Record<string, string | boolean>;
  version: number;
}

type CounterAction = { type: 'BUMP' };

/** A game that offers house rules: one boolean, one closed choice. */
const optionedModule: GameModule<CounterState, CounterAction> = {
  id: 'optioned',
  name: 'Optioned',
  minPlayers: 2,
  maxPlayers: 4,
  colors: ['red', 'green', 'blue', 'yellow'],
  tableOptions: [
    { id: 'stickTheDealer', label: 'Stick the dealer', type: 'boolean', default: false },
    {
      id: 'target',
      label: 'Play to',
      type: 'choice',
      default: '10',
      choices: [
        { value: '10', label: '10 points' },
        { value: '11', label: '11 points' },
      ],
    },
  ],
  createGame: (opts) => ({
    id: opts.id,
    count: 0,
    // The whole point: a game folds the table's rules into its own state at setup and reads them from
    // there forever after. `{}` would mean the host never sent them.
    dealtWith: { ...(opts.options ?? {}) },
    version: 0,
  }),
  applyAction: (state) => ({ ...state, count: state.count + 1, version: state.version + 1 }),
  legalActions: () => [{ type: 'BUMP' }],
  viewFor: (state) => state,
  parseAction: (raw) =>
    (raw as { type?: string })?.type === 'BUMP' ? { ok: true, action: { type: 'BUMP' } } : { ok: false, message: 'no' },
  summarize: (state) => ({
    id: state.id,
    turn: state.count,
    status: 'active',
    activePlayerId: 'p1',
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
  }),
  versionOf: (state) => state.version,
  movesOf: () => [],
  mapError: () => null,
};

/** A game with fixed rules — every one of the seven real games looks like this. */
const plainModule: GameModule<CounterState, CounterAction> = { ...optionedModule, id: 'plain', name: 'Plain' };
delete (plainModule as { tableOptions?: unknown }).tableOptions;

describe('table options (kernel 1.5.0)', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({
      db,
      registry: new GameRegistry().register(optionedModule).register(plainModule),
      defaultGameType: optionedModule.id,
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const seats = [{ name: 'Ann' }, { name: 'Bo' }];

  describe('the catalog', () => {
    it('publishes a game’s declared options, so the generic setup form can render them', async () => {
      const games = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
        id: string;
        tableOptions?: unknown;
      }[];
      const optioned = games.find((game) => game.id === 'optioned');
      expect(optioned?.tableOptions).toEqual(optionedModule.tableOptions);
    });

    it('puts no key on the wire for a game with fixed rules — no dead section in the form', async () => {
      const games = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
        id: string;
      }[];
      expect(games.find((game) => game.id === 'plain')).not.toHaveProperty('tableOptions');
    });
  });

  describe('POST /games', () => {
    it('hands the table’s picks to createGame', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { players: seats, options: { stickTheDealer: true, target: '11' } },
      });
      expect(response.statusCode).toBe(201);
      expect((response.json().game as CounterState).dealtWith).toEqual({ stickTheDealer: true, target: '11' });
    });

    it('fills every unpicked option with the game’s own default', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { players: seats, options: { target: '11' } },
      });
      expect((response.json().game as CounterState).dealtWith).toEqual({ stickTheDealer: false, target: '11' });
    });

    it('deals a game’s declared defaults when the body carries no options at all', async () => {
      // The pre-1.5.0 request shape. It must keep working untouched — that is what makes this additive.
      const response = await app.inject({ method: 'POST', url: '/games', payload: { players: seats } });
      expect(response.statusCode).toBe(201);
      expect((response.json().game as CounterState).dealtWith).toEqual({ stickTheDealer: false, target: '10' });
    });

    it('rejects an option the game never declared', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { players: seats, options: { nope: true } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TABLE_OPTION');
    });

    it('rejects a value outside a choice option', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { players: seats, options: { target: '12' } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toContain('10, 11');
    });

    it('rejects a non-boolean for a boolean option', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { players: seats, options: { stickTheDealer: 'yes' } },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects any pick at all for a game with fixed rules', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/games',
        payload: { gameType: 'plain', players: seats, options: { stickTheDealer: true } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('INVALID_TABLE_OPTION');
    });
  });

  describe('lobbies — the house rules are agreed when the room is opened', () => {
    const openLobby = async (options?: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/lobbies',
        payload: { seats: 2, gameType: 'optioned', ...(options ? { options } : {}) },
      });

    it('stores the resolved options on the room, so every joiner sees the same table', async () => {
      const created = await openLobby({ stickTheDealer: true });
      expect(created.statusCode).toBe(201);
      expect(created.json().lobby.options).toEqual({ stickTheDealer: true, target: '10' });
    });

    it('deals the game with the options the room agreed', async () => {
      const lobbyId = (await openLobby({ stickTheDealer: true, target: '11' })).json().lobby.id as string;
      for (const name of ['Ann', 'Bo']) {
        await app.inject({ method: 'POST', url: `/lobbies/${lobbyId}/join`, payload: { name } });
      }
      const started = await app.inject({ method: 'POST', url: `/lobbies/${lobbyId}/start` });
      expect(started.statusCode).toBe(201);
      expect((started.json().game as CounterState).dealtWith).toEqual({ stickTheDealer: true, target: '11' });
    });

    it('rejects an illegal pick when the room is opened, not when it starts', async () => {
      const created = await openLobby({ target: 'nonsense' });
      expect(created.statusCode).toBe(400);
      expect(created.json().error.code).toBe('INVALID_TABLE_OPTION');
    });

    it('starts a lobby written before the feature with the game’s defaults', async () => {
      // A room whose stored JSON has no `options` key at all — exactly what an already-deployed
      // database holds. It must open and deal, not crash on a missing field.
      const lobbyId = (await openLobby()).json().lobby.id as string;
      const row = db.prepare('SELECT data FROM lobbies WHERE id = ?').get(lobbyId) as { data: string };
      const stored = JSON.parse(row.data) as Record<string, unknown>;
      delete stored['options'];
      db.prepare('UPDATE lobbies SET data = ? WHERE id = ?').run(JSON.stringify(stored), lobbyId);

      for (const name of ['Ann', 'Bo']) {
        await app.inject({ method: 'POST', url: `/lobbies/${lobbyId}/join`, payload: { name } });
      }
      const started = await app.inject({ method: 'POST', url: `/lobbies/${lobbyId}/start` });
      expect(started.statusCode).toBe(201);
      expect((started.json().game as CounterState).dealtWith).toEqual({ stickTheDealer: false, target: '10' });
    });
  });
});
