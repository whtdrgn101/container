import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { GameRegistry, createDefaultRegistry } from '../games';
import type { GameModule } from '../games';
import { cantStopModule, containerModule, stoneAgeModule, stPetersburgModule } from '../games';
import { GameRepository } from '../repository';

/**
 * The honest test of state-schema versioning (REVIEW §4.1) — the module-seam pattern. A shipped game's
 * persisted shape can change; every in-flight game on the `/data` volume is frozen at the shape it was
 * saved at. The `GameModule` owns its shape knowledge (`schemaVersion` + `migrate`), and the repository
 * upgrades a stale row on read where module and row meet. A counter stub proves it without any real
 * game's shape leaking in: nothing here knows what a container or a die is.
 *
 * The stub comes in two shapes on purpose. **v1** stores `{ count }`; **v2** renames that field to `{ n }`
 * and declares `schemaVersion: 2` with a `migrate` that does the rename. Same `id` ('counter'), so a v1
 * row and the v2 module meet on the same table — exactly what an engine iteration looks like in the wild.
 */

interface CounterV1 {
  id: string;
  count: number;
  names: string[];
  version: number;
}

interface CounterV2 {
  id: string;
  n: number;
  names: string[];
  version: number;
}

type CounterAction = { type: 'BUMP'; by: number };

/** The shape everything shipped with: no `schemaVersion` (⇒ 1), no `migrate`. Stores `count`. */
const counterV1: GameModule<CounterV1, CounterAction> = {
  id: 'counter',
  name: 'Counter',
  minPlayers: 2,
  maxPlayers: 3,
  colors: ['red', 'green', 'blue'],
  createGame: (opts) => ({ id: opts.id, count: 0, names: opts.players.map((p) => p.name), version: 0 }),
  applyAction: (state, _playerId, action) => ({ ...state, count: state.count + action.by, version: state.version + 1 }),
  legalActions: () => [{ type: 'BUMP', by: 1 }],
  viewFor: (state) => state,
  parseAction: (raw) => {
    const record = raw as Record<string, unknown>;
    return record?.['type'] === 'BUMP' && typeof record['by'] === 'number'
      ? { ok: true, action: { type: 'BUMP', by: record['by'] } }
      : { ok: false, message: 'only BUMP' };
  },
  summarize: (state) => ({
    id: state.id,
    turn: state.count,
    status: 'active',
    activePlayerId: 'p1',
    players: state.names.map((name, i) => ({ id: `p${i + 1}`, name })),
  }),
  versionOf: (state) => state.version,
  movesOf: () => [],
  mapError: () => null,
};

/** How many times the v2 module's `migrate` ran — proves write-on-read upgrades a row exactly once. */
let migrateCalls = 0;

/** The iterated shape: `count` became `n`, so v2 declares `schemaVersion: 2` and a `migrate` to match. */
const counterV2: GameModule<CounterV2, CounterAction> = {
  id: 'counter',
  name: 'Counter',
  minPlayers: 2,
  maxPlayers: 3,
  colors: ['red', 'green', 'blue'],
  schemaVersion: 2,
  migrate: (state, from) => {
    migrateCalls += 1;
    // A v1 state (`count`) → a v2 state (`n`). `from` is the shape it was saved at.
    const old = state as CounterV1;
    expect(from).toBe(1);
    return { id: old.id, n: old.count, names: old.names, version: old.version };
  },
  createGame: (opts) => ({ id: opts.id, n: 0, names: opts.players.map((p) => p.name), version: 0 }),
  applyAction: (state, _playerId, action) => ({ ...state, n: state.n + action.by, version: state.version + 1 }),
  legalActions: () => [{ type: 'BUMP', by: 1 }],
  viewFor: (state) => state,
  parseAction: (raw) => {
    const record = raw as Record<string, unknown>;
    return record?.['type'] === 'BUMP' && typeof record['by'] === 'number'
      ? { ok: true, action: { type: 'BUMP', by: record['by'] } }
      : { ok: false, message: 'only BUMP' };
  },
  summarize: (state) => ({
    id: state.id,
    turn: state.n,
    status: 'active',
    activePlayerId: 'p1',
    players: state.names.map((name, i) => ({ id: `p${i + 1}`, name })),
  }),
  versionOf: (state) => state.version,
  movesOf: () => [],
  mapError: () => null,
};

describe('state-schema migration on read (REVIEW §4.1)', () => {
  let db: DB;

  beforeEach(() => {
    db = createDatabase();
    migrateCalls = 0;
  });

  afterEach(() => {
    db.close();
  });

  /** Deal a v1 counter row through a v1 server, then hand the same database to a v2 server. */
  const seedV1ThenBootV2 = async (): Promise<{ v2: FastifyInstance; id: string }> => {
    const v1 = buildApp({ db, registry: new GameRegistry().register(counterV1), defaultGameType: 'counter' });
    await v1.ready();
    const id = (await v1.inject({ method: 'POST', url: '/games', payload: { players: [{ name: 'Ann' }, { name: 'Bo' }] } }))
      .json().game.id as string;
    await v1.close();

    const v2 = buildApp({ db, registry: new GameRegistry().register(counterV2), defaultGameType: 'counter' });
    await v2.ready();
    return { v2, id };
  };

  it('migrates a v1 row to the v2 shape on GET, stamps schema_version, and leaves version untouched', async () => {
    const { v2, id } = await seedV1ThenBootV2();

    // The row on disk is still v1 before anyone reads it under the new server.
    expect(db.prepare(`SELECT schema_version, version FROM games WHERE id = ?`).get(id)).toEqual({
      schema_version: 1,
      version: 0,
    });

    const read = await v2.inject({ method: 'GET', url: `/games/${id}` });
    expect(read.statusCode).toBe(200);
    // The client sees the *migrated* shape: `n` exists, the old `count` is gone.
    expect(read.json().game.n).toBe(0);
    expect(read.json().game.count).toBeUndefined();
    expect(migrateCalls).toBe(1);

    // The row was upgraded in place: stamped v2, and its game `version` did NOT move — a migration is
    // not a move, so it neither bumps the counter nor appends to the log.
    expect(db.prepare(`SELECT schema_version, version FROM games WHERE id = ?`).get(id)).toEqual({
      schema_version: 2,
      version: 0,
    });

    await v2.close();
  });

  it('does not migrate again once a row is stamped', async () => {
    const { v2, id } = await seedV1ThenBootV2();
    await v2.inject({ method: 'GET', url: `/games/${id}` });
    expect(migrateCalls).toBe(1);
    // A later read sees a v2 row and skips migrate entirely.
    await v2.inject({ method: 'GET', url: `/games/${id}` });
    await v2.inject({ method: 'GET', url: '/games' });
    expect(migrateCalls).toBe(1);
    await v2.close();
  });

  it('applies an action after migration, on the migrated shape', async () => {
    const { v2, id } = await seedV1ThenBootV2();
    const acted = await v2.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: 5 } },
    });
    expect(acted.statusCode).toBe(200);
    expect(acted.json().game.n).toBe(5); // migrated 0 → bumped by 5
    // Now version moves (a real move), and the row stays stamped v2.
    expect(db.prepare(`SELECT schema_version, version FROM games WHERE id = ?`).get(id)).toEqual({
      schema_version: 2,
      version: 1,
    });
    await v2.close();
  });

  it('migrates lazily in the in-progress list too, and stamps once', async () => {
    const { v2, id } = await seedV1ThenBootV2();
    const listed = (await v2.inject({ method: 'GET', url: '/games' })).json().games as { id: string; turn: number }[];
    // `summarize` reads the migrated shape (`n`) — an un-upgraded row would have crashed it.
    expect(listed.find((g) => g.id === id)?.turn).toBe(0);
    expect(migrateCalls).toBe(1);
    expect(db.prepare(`SELECT schema_version FROM games WHERE id = ?`).get(id)).toEqual({ schema_version: 2 });
    await v2.close();
  });
});

describe('state-schema downgrade refusal (REVIEW §4.1)', () => {
  let db: DB;
  let app: FastifyInstance;
  let id: string;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db, registry: new GameRegistry().register(counterV2), defaultGameType: 'counter' });
    await app.ready();
    id = (await app.inject({ method: 'POST', url: '/games', payload: { players: [{ name: 'Ann' }, { name: 'Bo' }] } }))
      .json().game.id as string;
    // Stamp the row NEWER than the module reads — as if a future server wrote it, then we rolled back.
    db.prepare(`UPDATE games SET schema_version = 3 WHERE id = ?`).run(id);
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('409s GAME_SCHEMA_UNSUPPORTED on GET', async () => {
    const read = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(read.statusCode).toBe(409);
    expect(read.json().error.code).toBe('GAME_SCHEMA_UNSUPPORTED');
  });

  it('409s GAME_SCHEMA_UNSUPPORTED on POST /actions', async () => {
    const acted = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUMP', by: 1 } },
    });
    expect(acted.statusCode).toBe(409);
    expect(acted.json().error.code).toBe('GAME_SCHEMA_UNSUPPORTED');
  });

  it('skips the row in the in-progress list rather than crashing the home screen', async () => {
    const listed = await app.inject({ method: 'GET', url: '/games' });
    expect(listed.statusCode).toBe(200);
    expect((listed.json().games as { id: string }[]).map((g) => g.id)).not.toContain(id);
  });
});

describe('a module that bumped schemaVersion but forgot migrate', () => {
  it('throws loudly rather than guessing — a shipped shape changed with no upgrade written', async () => {
    const db = createDatabase();
    const repo = new GameRepository(db);
    // A v1 row on disk...
    const state: CounterV1 = { id: 'g1', count: 0, names: ['Ann', 'Bo'], version: 0 };
    repo.create(counterV1, state);
    // ...and a module that declares v2 but supplies no `migrate`. That is a wiring bug (an engine
    // iteration that nobody wrote the upgrade for), not something to silently deserialize.
    const broken: GameModule<CounterV2, CounterAction> = { ...counterV2, migrate: undefined };
    expect(() => repo.get(broken, 'g1')).toThrow(/no migrate/);
    db.close();
  });
});

describe('the real games are all shape-v1', () => {
  it('declares no schemaVersion, so a real game round-trips through the repository untouched', async () => {
    // Every shipped module is at the original shape — none has needed an iteration yet.
    for (const module of [containerModule, cantStopModule, stoneAgeModule, stPetersburgModule]) {
      expect(module.schemaVersion).toBeUndefined();
    }

    const db = createDatabase();
    const app = buildApp({ db, registry: createDefaultRegistry() });
    await app.ready();
    const id = (
      await app.inject({
        method: 'POST',
        url: '/games',
        payload: { gameType: 'container', players: [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }] },
      })
    ).json().game.id as string;

    // Stamped at v1 on create, and a read returns the same shape with no migration path engaged.
    expect(db.prepare(`SELECT schema_version FROM games WHERE id = ?`).get(id)).toEqual({ schema_version: 1 });
    const read = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json().game.supply).toBeDefined(); // still a Container game, unchanged

    await app.close();
    db.close();
  });
});
