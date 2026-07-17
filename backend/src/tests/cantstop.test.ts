import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Can't Stop over REST — the C3 proof that the platform hosts a second, very different game: dice
 * rolled server-side (the engine stays pure), no hidden information, no bots, and a win driven all the
 * way through the same core routes Container uses.
 *
 * The dice are made deterministic by seeding `AppOptions.rng`. `die = floor(rng() * 6) + 1`, so
 * feeding `(face - 0.5) / 6` yields exactly `face` — the test enqueues the four faces it wants before
 * each roll.
 */
function diceRng() {
  const queue: number[] = [];
  const rng = () => (queue.length > 0 ? queue.shift()! : 0);
  const enqueue = (faces: number[]): void => {
    for (const face of faces) queue.push((face - 0.5) / 6);
  };
  return { rng, enqueue };
}

describe('Can\'t Stop over REST', () => {
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

  const create = async (names: string[]) => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'cantstop', players: names.map((name) => ({ name })) },
    });
    expect(response.statusCode).toBe(201);
    return response.json().game as { id: string };
  };

  const roll = (id: string, playerId: string, faces: number[]) => {
    dice.enqueue(faces);
    return app.inject({ method: 'POST', url: `/games/${id}/cantstop/roll`, payload: { playerId } });
  };
  const select = (id: string, playerId: string, columns: number[]) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'SELECT', columns } } });
  const stop = (id: string, playerId: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'STOP' } } });
  const read = async (id: string) => (await app.inject({ method: 'GET', url: `/games/${id}` })).json();

  it('rolls dice server-side and enters the selecting phase', async () => {
    const { id } = await create(['Ann', 'Bob']);
    const response = await roll(id, 'p1', [1, 2, 3, 4]);
    expect(response.statusCode).toBe(200);
    expect(response.json().gameType).toBe('cantstop');
    expect(response.json().game.phase).toBe('selecting');
    expect(response.json().game.dice).toEqual([1, 2, 3, 4]);
  });

  it('applies SELECT then STOP, banking progress and passing the turn', async () => {
    const { id } = await create(['Ann', 'Bob']);
    await roll(id, 'p1', [1, 2, 3, 4]);
    const selected = await select(id, 'p1', [3, 7]);
    expect(selected.statusCode).toBe(200);
    expect(selected.json().game.runners).toEqual({ 3: 1, 7: 1 });

    const stopped = await stop(id, 'p1');
    expect(stopped.json().game.players[0].progress).toEqual({ 3: 1, 7: 1 });
    expect(stopped.json().game.activePlayerIndex).toBe(1);
  });

  it('refuses a ROLL posted to /actions — dice are server-only', async () => {
    const { id } = await create(['Ann', 'Bob']);
    const response = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'ROLL', dice: [6, 6, 6, 6] } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/server-only/);
  });

  it('locks the roll to the seat on the clock', async () => {
    const { id } = await create(['Ann', 'Bob']);
    const response = await roll(id, 'p2', [1, 2, 3, 4]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_YOUR_TURN');
  });

  it('maps an illegal pairing to 409', async () => {
    const { id } = await create(['Ann', 'Bob']);
    await roll(id, 'p1', [1, 2, 3, 4]);
    const response = await select(id, 'p1', [3, 4]);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_SELECTION');
  });

  it('enforces Can\'t Stop\'s own 2–4 seat range on lobbies', async () => {
    const tooMany = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 5, gameType: 'cantstop' } });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.code).toBe('INVALID_SEAT_COUNT');

    const ok = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 2, gameType: 'cantstop' } });
    expect(ok.statusCode).toBe(201);
  });

  it('hosts Container and Can\'t Stop side by side, each with its own shape', async () => {
    const container = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'container', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] },
    });
    const cantstop = await create(['A', 'B']);

    const containerRead = await read(container.json().game.id);
    expect(containerRead.gameType).toBe('container');
    expect(containerRead.game.supply).toBeDefined();

    const cantstopRead = await read(cantstop.id);
    expect(cantstopRead.gameType).toBe('cantstop');
    expect(cantstopRead.game.supply).toBeUndefined();
    expect(cantstopRead.game.claimed).toEqual({});
  });

  it('plays a whole game to a win through the core routes', async () => {
    const { id } = await create(['Ann', 'Bob']);

    // Ann claims column 2 (height 3): two rolls of all-ones bank a runner onto the top space.
    await roll(id, 'p1', [1, 1, 1, 1]);
    await select(id, 'p1', [2, 2]);
    await roll(id, 'p1', [1, 1, 1, 1]);
    await select(id, 'p1', [2]);
    await stop(id, 'p1');

    // Bob rolls only into the now-claimed column 2 and busts, handing the turn straight back.
    const bobBust = await roll(id, 'p2', [1, 1, 1, 1]);
    expect(bobBust.json().game.activePlayerIndex).toBe(0);

    // Ann claims column 12 the same way.
    await roll(id, 'p1', [6, 6, 6, 6]);
    await select(id, 'p1', [12, 12]);
    await roll(id, 'p1', [6, 6, 6, 6]);
    await select(id, 'p1', [12]);
    await stop(id, 'p1');
    await roll(id, 'p2', [6, 6, 6, 6]); // Bob busts on claimed column 12 again

    // Ann claims column 3 (height 5) for her third column — the game ends on that stop.
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3, 3]);
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3, 3]);
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3]);
    const win = await stop(id, 'p1');

    expect(win.json().game.status).toBe('ended');
    expect(win.json().game.winnerIds).toEqual(['p1']);
    expect(win.json().game.claimed).toEqual({ 2: 'p1', 12: 'p1', 3: 'p1' });
  });
});
