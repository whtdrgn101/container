import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Stone Age bootstrap (roadmap SA0) over REST — the platform proof that a third game registers and
 * renders, coexisting with Container and Can't Stop. It has no playable actions yet (each lands in its
 * own stage), so `/actions` is refused.
 */
describe('Stone Age bootstrap', () => {
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

  it('is listed in the catalog alongside the other games', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as { id: string }[];
    expect(catalog.map((g) => g.id)).toEqual(['container', 'cantstop', 'stoneage']);
  });

  it('deals a fresh game with the Stone Age starting setup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().gameType).toBe('stoneage');
    const game = res.json().game;
    expect(game.round).toBe(1);
    expect(game.phase).toBe('placement');
    expect(game.players.map((p: { name: string; people: number; food: number }) => [p.name, p.people, p.food])).toEqual([
      ['Ann', 5, 12],
      ['Bob', 5, 12],
    ]);
  });

  it('places people over REST (SA1) and passes the turn', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    const placed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'forest', count: 3 } },
    });
    expect(placed.statusCode).toBe(200);
    expect(placed.json().game.placements.forest).toEqual({ p1: 3 });
    expect(placed.json().game.activePlayerIndex).toBe(1); // Bob is up

    // Off-turn / illegal placements are refused.
    const offTurn = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'hunt', count: 1 } },
    });
    expect(offTurn.statusCode).toBe(409);
    expect(offTurn.json().error.code).toBe('NOT_YOUR_TURN');

    const badPayload = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'PLACE', place: 'nowhere', count: 1 } },
    });
    expect(badPayload.statusCode).toBe(400); // parseAction rejects an unknown place
  });

  it('enforces Stone Age\'s 2–4 seat range on lobbies', async () => {
    const tooMany = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 5, gameType: 'stoneage' } });
    expect(tooMany.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 4, gameType: 'stoneage' } });
    expect(ok.statusCode).toBe(201);
  });
});
