import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { createDefaultRegistry, GameRegistry } from '../games';
import type { GameModule } from '../games';

/**
 * The honest test of the C0 seam: host a game that is **not Container** and drive it through the core
 * — create, read, act, list, error-map — without the core knowing anything about it.
 *
 * The Container tests in `app.test.ts` can't prove this. They pass just as well if the core is
 * secretly hardcoded to Container, which is exactly what C0 set out to undo. A second game is the
 * only thing that can tell the difference, and C3 is a long way off.
 *
 * The stub is a counter: `{ count }`, one action `BUMP`. Deliberately nothing like Container — no
 * seats, no cards, no auction — so anything the core assumes about a game's shape shows up here as a
 * failure rather than as a surprise in C3.
 */

interface CounterState {
  id: string;
  count: number;
  names: string[];
  version: number;
}

type CounterAction = { type: 'BUMP'; by: number };

class CounterError extends Error {}

const counterModule: GameModule<CounterState, CounterAction> = {
  id: 'counter',
  name: 'Counter',
  minPlayers: 2,
  maxPlayers: 3,

  createGame: (opts) => ({
    id: opts.id,
    // Reads the injected rng, to prove the core actually supplies one.
    count: Math.floor(opts.rng() * 10),
    names: opts.players.map((p) => p.name),
    version: 0,
  }),

  applyAction: (state, _playerId, action) => {
    if (action.by <= 0) throw new CounterError('BUMP must be positive');
    return { ...state, count: state.count + action.by, version: state.version + 1 };
  },

  legalActions: () => [{ type: 'BUMP', by: 1 }],

  // A redaction the core must honour without understanding it.
  viewFor: (state, viewer) => ({ ...state, viewer: viewer ?? null, secret: undefined }),

  parseAction: (raw) => {
    const record = raw as Record<string, unknown>;
    if (record?.['type'] !== 'BUMP') return { ok: false, message: 'only BUMP' };
    if (typeof record['by'] !== 'number') return { ok: false, message: 'BUMP needs a numeric `by`' };
    return { ok: true, action: { type: 'BUMP', by: record['by'] } };
  },

  summarize: (state) => ({
    id: state.id,
    turn: state.count,
    status: 'active',
    activePlayerId: 'p1',
    players: state.names.map((name, i) => ({ id: `p${i + 1}`, name })),
  }),

  versionOf: (state) => state.version,

  // A game that keeps no move log at all — the repository must cope.
  movesOf: () => [],

  mapError: (error) => (error instanceof CounterError ? { status: 418, code: 'BAD_BUMP', message: error.message } : null),
};

describe('a non-Container game hosted through the GameModule seam', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db, registry: new GameRegistry().register(counterModule) });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const create = async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bo' }] },
    });
    expect(response.statusCode).toBe(201);
    return response.json().game as CounterState;
  };

  it('lists the hosted game in the catalog', async () => {
    const response = await app.inject({ method: 'GET', url: '/games/catalog' });
    expect(response.json().games).toEqual([{ id: 'counter', name: 'Counter', minPlayers: 2, maxPlayers: 3 }]);
  });

  it('creates a game through the module and projects it through its own viewFor', async () => {
    const game = await create();
    expect(game.names).toEqual(['Ann', 'Bo']);
    expect(game.count).toBeGreaterThanOrEqual(0);
  });

  it('applies an action the core cannot interpret', async () => {
    const game = await create();
    const before = game.count;
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: 5 } },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as CounterState).count).toBe(before + 5);
  });

  it('rejects a payload the module refuses to parse, with the module\'s reason', async () => {
    const game = await create();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PRODUCE' } },
    });
    // Container's action types mean nothing here — proof the old 13-value route schema is really gone.
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toEqual({ code: 'BAD_ACTION', message: 'only BUMP' });
  });

  it("maps the module's own error type onto the status it asked for", async () => {
    const game = await create();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: -1 } },
    });
    expect(response.statusCode).toBe(418);
    expect(response.json().error.code).toBe('BAD_BUMP');
  });

  it('lists in-progress games using the module’s summary', async () => {
    const game = await create();
    const response = await app.inject({ method: 'GET', url: '/games' });
    const listed = (response.json().games as { id: string; players: unknown[] }[]).find((g) => g.id === game.id);
    expect(listed?.players).toEqual([
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ]);
  });

  it('enforces the module’s seat range on lobbies, not Container’s 3–5', async () => {
    const ok = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 2 } });
    expect(ok.statusCode).toBe(201);
    const tooMany = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 5 } });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.message).toBe('Seats must be 2–3');
  });

  it('runs a game with no bots and no module routes without complaint', async () => {
    const game = await create();
    const response = await app.inject({ method: 'GET', url: `/games/${game.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().bots).toEqual([]);
    // Container's auction endpoints belong to Container's module, so they don't exist here at all.
    const auction = await app.inject({ method: 'GET', url: `/games/${game.id}/auction` });
    expect(auction.statusCode).toBe(404);
  });
});

describe('registry ambiguity', () => {
  // C0 has no game_type column, so a second game would make "which module owns this row?"
  // unanswerable. Better a boot crash than loading someone's game with the wrong engine.
  it('refuses to boot with two games registered', () => {
    const db = createDatabase();
    const registry = createDefaultRegistry().register(counterModule);
    expect(() => buildApp({ db, registry })).toThrow(/Exactly one game may be registered/);
    db.close();
  });

  it('refuses to boot with no game registered', () => {
    const db = createDatabase();
    expect(() => buildApp({ db, registry: new GameRegistry() })).toThrow(/Exactly one game may be registered/);
    db.close();
  });
});
