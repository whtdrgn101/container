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

/** Deterministic dice: `die = floor(rng()*6)+1`, so `(face-0.5)/6` yields exactly `face`. */
function diceRng() {
  const queue: number[] = [];
  const rng = () => (queue.length > 0 ? queue.shift()! : 0);
  const enqueue = (faces: number[]): void => {
    for (const face of faces) queue.push((face - 0.5) / 6);
  };
  return { rng, enqueue };
}

describe('Stone Age gathering (SA2)', () => {
  let db: DB;
  let dice: ReturnType<typeof diceRng>;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    dice = diceRng();
    app = buildApp({ db, rng: dice.rng });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const placeAction = (id: string, playerId: string, place: string, count: number) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'PLACE', place, count } } });

  it('gathers resources by rolling dice server-side', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    // A full placement round: Ann fills the forest, Bob the clay pit — both out of people.
    await placeAction(id, 'p1', 'forest', 5);
    await placeAction(id, 'p2', 'clayPit', 5);

    // The action phase begins with Ann (start player) on the forest.
    const before = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(before.json().game.phase).toBe('actions');

    // Roll: five sixes = 30, wood per full 3 → 10 wood.
    dice.enqueue([6, 6, 6, 6, 6]);
    const rolled = await app.inject({
      method: 'POST',
      url: `/games/${id}/stoneage/roll`,
      payload: { playerId: 'p1', place: 'forest' },
    });
    expect(rolled.statusCode).toBe(200);
    expect(rolled.json().game.players[0].resources.wood).toBe(10);
    expect(rolled.json().game.placements.forest).toEqual({}); // people returned
  });

  it('refuses a GATHER posted to /actions — dice are server-only', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'GATHER', place: 'forest', dice: [6, 6] } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/server-only/);
  });
});
