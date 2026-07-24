import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Russian Railroads over REST — the platform proof that a **fifth** game registers and plays, and the
 * **Track D pilot**: this game is hosted from its own in-workspace package (`@game-hub/game-russianrailroads`)
 * rather than a folder in the backend, so it exercises the package-shaped `GameModule` end-to-end. The
 * standing interest is the same as every game's: redaction (the end-bonus pile order) holds on the wire.
 */
describe('Russian Railroads (Track D package)', () => {
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

  const create = (players: { name: string }[]) =>
    app.inject({ method: 'POST', url: '/games', payload: { gameType: 'russianrailroads', players } });

  const activeOf = async (id: string) =>
    (await app.inject({ method: 'GET', url: `/games/${id}` })).json().activePlayerId as string;

  it('appears in the catalog with its palette and seat bounds', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
    }[];
    const rr = catalog.find((g) => g.id === 'russianrailroads')!;
    expect(rr).toMatchObject({ minPlayers: 2, maxPlayers: 4, colors: ['green', 'blue', 'red', 'yellow'] });
  });

  it('creates a game and tags the payload with its type', async () => {
    const res = await create([{ name: 'Ann' }, { name: 'Bob' }]);
    expect(res.statusCode).toBe(201);
    const body = res.json() as { gameType: string; game: { round: number; players: unknown[] } };
    expect(body.gameType).toBe('russianrailroads');
    expect(body.game.round).toBe(1);
    expect(body.game.players).toHaveLength(2);
  });

  it('plays a worker placement and a pass through /actions', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const first = await activeOf(game.id);
    const placed = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: first, action: { type: 'PLACE', space: 'coins' } },
    });
    expect(placed.statusCode).toBe(200);
    const afterPlace = placed.json().game as { actionSpaces: Record<string, unknown[]> };
    expect(afterPlace.actionSpaces['coins']).toHaveLength(1);

    const second = await activeOf(game.id);
    expect(second).not.toBe(first);
    const passed = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: second, action: { type: 'PASS' } },
    });
    expect(passed.statusCode).toBe(200);
  });

  it('never sends the end-bonus pile order to a client (redaction on the wire)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const view = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as Record<
      string,
      unknown
    >;
    expect(view['endBonusPile']).toBeUndefined();
    expect(typeof view['endBonusPileCount']).toBe('number');
    // Opponents' held end-bonus cards are counts only (nobody holds one in RR1, but the shape redacts).
    const players = view['players'] as { id: string; endBonus: unknown; endBonusHeld: number }[];
    expect(players.every((p) => p.endBonus === null)).toBe(true);
  });

  it("maps a wrong-turn move to 409, and reports the module's error code", async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const active = await activeOf(game.id);
    const other = active === 'p1' ? 'p2' : 'p1';
    const res = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: other, action: { type: 'PASS' } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('NOT_YOUR_TURN');
  });
});
