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
  // A palette proves the contract's newest field — even a game nothing like Container declares one.
  colors: ['red', 'green', 'blue'],

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

  mapError: (error) =>
    error instanceof CounterError ? { status: 418, code: 'BAD_BUMP', message: error.message } : null,
};

describe('a non-Container game hosted through the GameModule seam', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({
      db,
      registry: new GameRegistry().register(counterModule),
      defaultGameType: counterModule.id,
    });
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
    expect(response.json().games).toEqual([
      { id: 'counter', name: 'Counter', minPlayers: 2, maxPlayers: 3, colors: ['red', 'green', 'blue'] },
    ]);
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

  it("rejects a payload the module refuses to parse, with the module's reason", async () => {
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
    // The payload's seat identity (§3.3) comes from the module's `summarize`, not a field off the
    // game state — the counter's state has no `players` array at all, so a duck-typed core would send
    // nothing here. This is the same honest test that caught the repository reading `state.version`.
    const body = response.json() as { players: { id: string; name: string }[]; activePlayerId: string | null };
    expect(body.players).toEqual([
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ]);
    expect(body.activePlayerId).toBe('p1');
    // Container's auction endpoints belong to Container's module, so they don't exist here at all.
    const auction = await app.inject({ method: 'GET', url: `/games/${game.id}/container/auction` });
    expect(auction.statusCode).toBe(404);
  });
});

/**
 * Two games on one server — what C1 is *for*, and the thing C0 had to refuse.
 *
 * Until `game_type` existed, a `games` row was an id and an opaque blob, so the server couldn't tell
 * one game's rules from another's and `buildApp` threw rather than guess. These tests are the proof
 * that it no longer has to.
 */
describe('hosting two games at once', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db, registry: createDefaultRegistry().register(counterModule) });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const createOf = async (gameType: string | undefined, players: { name: string }[]) => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { ...(gameType ? { gameType } : {}), players },
    });
    expect(response.statusCode).toBe(201);
    return response.json().game as { id: string };
  };

  const threeNames = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }];

  it('lists every hosted game in the catalog', async () => {
    const response = await app.inject({ method: 'GET', url: '/games/catalog' });
    // The default registry ships the real games (Container, Can't Stop, Stone Age, Saint Petersburg, and
    // the Track D pilot Russian Railroads); this test adds the counter stub on top, so all appear side by side.
    expect((response.json().games as { id: string }[]).map((g) => g.id)).toEqual([
      'container',
      'cantstop',
      'stoneage',
      'stpetersburg',
      'russianrailroads',
      'counter',
    ]);
  });

  it('deals each type from its own module, and tells them apart on read', async () => {
    const container = await createOf('container', threeNames);
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);

    // A Container game has Container's shape; a counter game has the counter's. Same endpoint.
    const containerRead = await app.inject({ method: 'GET', url: `/games/${container.id}` });
    expect(containerRead.json().game.players).toHaveLength(3);
    expect(containerRead.json().game.supply).toBeDefined();

    const counterRead = await app.inject({ method: 'GET', url: `/games/${counter.id}` });
    expect(counterRead.json().game.count).toBeDefined();
    expect(counterRead.json().game.supply).toBeUndefined();
  });

  it('routes each game’s actions to its own rules', async () => {
    const container = await createOf('container', threeNames);
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);

    // BUMP means nothing to Container...
    const bumpContainer = await app.inject({
      method: 'POST',
      url: `/games/${container.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: 1 } },
    });
    expect(bumpContainer.statusCode).toBe(400);
    expect(bumpContainer.json().error.message).toMatch(/Unknown action type "BUMP"/);

    // ...and END_TURN means nothing to the counter.
    const endCounter = await app.inject({
      method: 'POST',
      url: `/games/${counter.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'END_TURN' } },
    });
    expect(endCounter.statusCode).toBe(400);
    expect(endCounter.json().error.message).toBe('only BUMP');
  });

  it('enforces each game’s own seat range on lobbies', async () => {
    // 2 seats is legal for the counter and illegal for Container; 5 is the reverse.
    expect(
      (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'counter', seats: 2 } })).statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'container', seats: 2 } })).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'container', seats: 5 } })).statusCode,
    ).toBe(201);
    expect(
      (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'counter', seats: 5 } })).statusCode,
    ).toBe(400);
  });

  it('starts a lobby as the game the lobby was created for', async () => {
    const lobby = (
      await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'counter', seats: 2 } })
    ).json().lobby as { id: string; gameType: string };
    expect(lobby.gameType).toBe('counter');
    for (const name of ['Ann', 'Bo']) {
      await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/join`, payload: { name } });
    }
    const started = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
    expect(started.statusCode).toBe(201);
    // A counter game, not the default — the lobby's choice survived to the deal.
    expect((started.json().game as { count?: number }).count).toBeDefined();
  });

  // A game view is an opaque blob to anyone generic, so every payload carrying one must say what it
  // is — otherwise C2's shell has no way to pick a board for a state it just fetched.
  it('tags every game payload with its type, on create, read and act', async () => {
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);
    const container = await createOf('container', threeNames);

    const read = await app.inject({ method: 'GET', url: `/games/${counter.id}` });
    expect(read.json().gameType).toBe('counter');

    const acted = await app.inject({
      method: 'POST',
      url: `/games/${counter.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: 1 } },
    });
    expect(acted.json().gameType).toBe('counter');

    expect((await app.inject({ method: 'GET', url: `/games/${container.id}` })).json().gameType).toBe('container');
  });

  it('tags the live stream’s pushes too, so a socket-only client can tell', async () => {
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);
    const socket = await app.injectWS(`/games/${counter.id}/stream`);
    const first = await new Promise<{ gameType: string }>((resolve) => {
      socket.on('message', (data: Buffer) => resolve(JSON.parse(data.toString())));
    });
    expect(first.gameType).toBe('counter');
    await socket.terminate();
  });

  it('tags each listing with its game type, so a generic client knows which board to open', async () => {
    const container = await createOf('container', threeNames);
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);
    const listed = (await app.inject({ method: 'GET', url: '/games' })).json().games as {
      id: string;
      gameType: string;
    }[];
    expect(listed.find((g) => g.id === container.id)?.gameType).toBe('container');
    expect(listed.find((g) => g.id === counter.id)?.gameType).toBe('counter');
  });

  // The namespace is what keeps two games' endpoints apart; the guard is what keeps a module from
  // ever being handed a state it can't read. A prefix alone is just a URL anyone can type.
  it('refuses one game’s endpoints for another game’s row', async () => {
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);
    const response = await app.inject({ method: 'GET', url: `/games/${counter.id}/container/auction` });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('WRONG_GAME_TYPE');
  });

  it('serves a Container game its own auction endpoint under the namespace', async () => {
    const container = await createOf('container', threeNames);
    const response = await app.inject({ method: 'GET', url: `/games/${container.id}/container/auction` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ auction: null }); // nobody is at the island yet
  });

  // The honest all-games check (SP7, extended for RR1): all FIVE real games *and* the counter stub live
  // in one app instance at once — create one of each, drive a real move into each game's own engine, and
  // list them all side by side. Russian Railroads is the Track D pilot (hosted from its own package), so
  // its presence here proves a package-shaped module routes exactly like the in-repo ones.
  it('hosts all five real games plus the counter stub at once — create, act, list', async () => {
    const container = await createOf('container', threeNames);
    const cantstop = await createOf('cantstop', [{ name: 'Ann' }, { name: 'Bo' }]);
    const stoneage = await createOf('stoneage', [{ name: 'Ann' }, { name: 'Bo' }]);
    const stpetersburg = await createOf('stpetersburg', [{ name: 'Ann' }, { name: 'Bo' }]);
    const russianrailroads = await createOf('russianrailroads', [{ name: 'Ann' }, { name: 'Bo' }]);
    const counter = await createOf('counter', [{ name: 'Ann' }, { name: 'Bo' }]);

    // The active seat of a freshly-dealt game, from the module's own summary (no field read off state).
    const activeOf = async (id: string) =>
      (await app.inject({ method: 'GET', url: `/games/${id}` })).json().activePlayerId as string;
    const act = (id: string, playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action } });

    // A real move into each game's own rules, driven as that game's active seat — each routed by the
    // row's game_type to its own engine, none of which the core understands.
    expect((await act(container.id, await activeOf(container.id), { type: 'PRODUCE' })).statusCode).toBe(200);
    // Can't Stop's dice are server-only — the roll is its module route, not a client `/actions` move.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/games/${cantstop.id}/cantstop/roll`,
          payload: { playerId: await activeOf(cantstop.id) },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await act(stoneage.id, await activeOf(stoneage.id), { type: 'PLACE', place: 'forest', count: 1 })).statusCode,
    ).toBe(200);
    expect((await act(stpetersburg.id, await activeOf(stpetersburg.id), { type: 'PASS' })).statusCode).toBe(200);
    // Russian Railroads opens in the RR6 starting-bonus setup mini-phase (pg. 6): resolve one bonus card.
    expect(
      (
        await act(russianrailroads.id, await activeOf(russianrailroads.id), {
          type: 'RESOLVE_SETUP_BONUS',
          card: 'start-coins-2',
        })
      ).statusCode,
    ).toBe(200);
    expect((await act(counter.id, 'p1', { type: 'BUMP', by: 1 })).statusCode).toBe(200);

    // All five are in the in-progress list, each tagged with its own type.
    const listed = (await app.inject({ method: 'GET', url: '/games' })).json().games as {
      id: string;
      gameType: string;
    }[];
    const byId = new Map(listed.map((g) => [g.id, g.gameType]));
    expect(byId.get(container.id)).toBe('container');
    expect(byId.get(cantstop.id)).toBe('cantstop');
    expect(byId.get(stoneage.id)).toBe('stoneage');
    expect(byId.get(stpetersburg.id)).toBe('stpetersburg');
    expect(byId.get(russianrailroads.id)).toBe('russianrailroads');
    expect(byId.get(counter.id)).toBe('counter');
  });

  // Saint Petersburg declares **no module routes** (every special is an engine rule), so its
  // `/games/:id/stpetersburg/*` namespace has nothing registered under it. A request there must 404
  // cleanly — not fall through to the SPA handler or be misrouted — whether the row is a Saint Petersburg
  // game or not, and a *cross-game* call to another game's real endpoint is refused by the type guard.
  it('404s the routeless stpetersburg namespace cleanly, and guards cross-game calls', async () => {
    const stpetersburg = await createOf('stpetersburg', [{ name: 'Ann' }, { name: 'Bo' }]);
    const container = await createOf('container', threeNames);

    // Its own namespace has no routes → a plain 404 (there is no endpoint to hit), for its own row…
    expect(
      (await app.inject({ method: 'GET', url: `/games/${stpetersburg.id}/stpetersburg/auction` })).statusCode,
    ).toBe(404);
    // …and for another game's row too (still nothing registered there).
    expect((await app.inject({ method: 'GET', url: `/games/${container.id}/stpetersburg/anything` })).statusCode).toBe(
      404,
    );

    // The reverse — a Saint Petersburg row asked for Container's real endpoint — is refused by the guard,
    // not served, so a namespaced URL can never hand one game's state to another's module.
    const cross = await app.inject({ method: 'GET', url: `/games/${stpetersburg.id}/container/auction` });
    expect(cross.statusCode).toBe(404);
    expect(cross.json().error.code).toBe('WRONG_GAME_TYPE');
  });

  it('rejects creating a game nobody hosts', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'chess', players: threeNames },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('UNKNOWN_GAME_TYPE');
  });

  it('falls back to the default game when the caller names no type', async () => {
    // The hotseat quick-start posts no gameType and must keep working.
    const game = await createOf(undefined, threeNames);
    const read = await app.inject({ method: 'GET', url: `/games/${game.id}` });
    expect(read.json().game.supply).toBeDefined(); // Container
  });
});

/** A row whose module has since been unregistered: readable-ish, but honest about being unplayable. */
describe('a game whose type is no longer hosted', () => {
  it('says so rather than 500ing or loading it with the wrong rules', async () => {
    const db = createDatabase();
    // Create a counter game, then rebuild the server *without* the counter registered.
    const withCounter = buildApp({
      db,
      registry: new GameRegistry().register(counterModule),
      defaultGameType: 'counter',
    });
    await withCounter.ready();
    const id = (
      await withCounter.inject({ method: 'POST', url: '/games', payload: { players: [{ name: 'Ann' }] } })
    ).json().game.id as string;
    await withCounter.close();

    const withoutCounter = buildApp({ db, registry: createDefaultRegistry() });
    await withoutCounter.ready();

    const read = await withoutCounter.inject({ method: 'GET', url: `/games/${id}` });
    expect(read.statusCode).toBe(409);
    expect(read.json().error.code).toBe('GAME_TYPE_UNAVAILABLE');

    // And it quietly drops out of the in-progress list rather than taking the home screen down.
    const listed = await withoutCounter.inject({ method: 'GET', url: '/games' });
    expect(listed.statusCode).toBe(200);
    expect((listed.json().games as { id: string }[]).map((g) => g.id)).not.toContain(id);

    await withoutCounter.close();
    db.close();
  });
});
