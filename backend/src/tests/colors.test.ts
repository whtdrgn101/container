import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { assignColors } from '../colors';

/** Deterministic PRNG (mirrors rematch.test) — a seed that lets an all-bot Can't Stop game finish. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Player-colour picking — the cross-game feature: each game declares a palette, the platform offers
 * the pick in the lobby and on create, enforces uniqueness, persists the choice beside the game (its
 * own table, like bots), and carries it on every state payload. The engine never learns a colour.
 *
 * Can't Stop is the vehicle (palette `['rose','sky','amber','emerald']`, 2–4 players) — nothing about
 * colours is Container-shaped.
 */
describe('assignColors (pure)', () => {
  const palette = ['rose', 'sky', 'amber', 'emerald'];

  it('fills unpicked seats with palette order, reproducing the old per-seat-index tints', () => {
    expect(assignColors(palette, [undefined, undefined, undefined])).toEqual(['rose', 'sky', 'amber']);
  });

  it('honours a pick and fills the rest with the first still-free colours', () => {
    expect(assignColors(palette, ['amber', undefined, undefined])).toEqual(['amber', 'rose', 'sky']);
  });

  it('drops a duplicate pick so two seats never share a colour', () => {
    expect(assignColors(palette, ['sky', 'sky'])).toEqual(['sky', 'rose']);
  });

  it('drops a pick that is not in the palette', () => {
    expect(assignColors(palette, ['purple', undefined])).toEqual(['rose', 'sky']);
  });
});

describe('colours across the platform', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    // Deterministic rng so Can't Stop's dice never matter here (we only read colours, never roll).
    app = buildApp({ db, rng: () => 0.5 });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const createLobby = async (seats = 2) =>
    (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'cantstop', seats } })).json()
      .lobby as { id: string };
  const join = (id: string, name: string, color?: string) =>
    app.inject({ method: 'POST', url: `/lobbies/${id}/join`, payload: { name, ...(color ? { color } : {}) } });

  it('publishes every game’s palette on the catalog', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      colors: string[];
    }[];
    const byId = Object.fromEntries(catalog.map((g) => [g.id, g.colors]));
    expect(byId['container']).toEqual(['indigo', 'teal', 'rose', 'amber', 'violet']);
    expect(byId['cantstop']).toEqual(['rose', 'sky', 'amber', 'emerald']);
    expect(byId['stoneage']).toEqual(['red', 'blue', 'green', 'yellow']);
  });

  it('accepts a valid colour on join and records it on the seat', async () => {
    const lobby = await createLobby();
    const res = await join(lobby.id, 'Ann', 'amber');
    expect(res.statusCode).toBe(200);
    expect(res.json().lobby.members[0]).toMatchObject({ name: 'Ann', color: 'amber' });
  });

  it('rejects a colour another seat already took', async () => {
    const lobby = await createLobby();
    await join(lobby.id, 'Ann', 'amber');
    const res = await join(lobby.id, 'Bob', 'amber');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COLOR_TAKEN');
  });

  it('rejects a colour outside the game’s palette', async () => {
    const lobby = await createLobby();
    const res = await join(lobby.id, 'Ann', 'indigo'); // a Container colour, not Can't Stop's
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_COLOR');
  });

  it('keeps the join flow working colour-less', async () => {
    const lobby = await createLobby();
    const res = await join(lobby.id, 'Ann');
    expect(res.statusCode).toBe(200);
    expect(res.json().lobby.members[0]).toEqual({ name: 'Ann', bot: false });
  });

  it('changes a seat’s colour while waiting', async () => {
    const lobby = await createLobby();
    await join(lobby.id, 'Ann', 'rose');
    const changed = await app.inject({
      method: 'POST',
      url: `/lobbies/${lobby.id}/color`,
      payload: { seat: 0, color: 'emerald' },
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().lobby.members[0].color).toBe('emerald');
    // Re-picking the same colour you already hold is fine (excludes your own seat).
    expect(
      (await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/color`, payload: { seat: 0, color: 'emerald' } }))
        .statusCode,
    ).toBe(200);
  });

  it('refuses a colour change to one another seat holds, or on an empty seat', async () => {
    const lobby = await createLobby();
    await join(lobby.id, 'Ann', 'rose');
    await join(lobby.id, 'Bob', 'sky');
    const taken = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/color`, payload: { seat: 1, color: 'rose' } });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('COLOR_TAKEN');
    const empty = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/color`, payload: { seat: 3, color: 'amber' } });
    expect(empty.statusCode).toBe(409);
    expect(empty.json().error.code).toBe('SEAT_NOT_CLAIMED');
  });

  it('assigns colours on lobby start: picks honoured, the rest defaulted in palette order', async () => {
    const lobby = await createLobby(3);
    await join(lobby.id, 'Ann', 'amber'); // seat 0 picks amber
    await join(lobby.id, 'Bob'); //           seat 1 unpicked
    await join(lobby.id, 'Cy', 'rose'); //    seat 2 picks rose
    const started = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
    expect(started.statusCode).toBe(201);
    // amber → p1, rose → p3 honoured; p2 gets the first free colour in order (rose taken → sky).
    expect(started.json().colors).toEqual({ p1: 'amber', p2: 'sky', p3: 'rose' });
  });

  it('carries colours on create, GET, the action reply, and the WS push', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'cantstop', players: [{ name: 'Ann', color: 'emerald' }, { name: 'Bob' }] },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().colors).toEqual({ p1: 'emerald', p2: 'rose' }); // emerald honoured, p2 first free
    const id = created.json().game.id as string;

    const got = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(got.json().colors).toEqual({ p1: 'emerald', p2: 'rose' });

    // An action reply carries colours too. A roll is the simplest legal Can't Stop move.
    const rolled = await app.inject({ method: 'POST', url: `/games/${id}/cantstop/roll`, payload: { playerId: 'p1' } });
    expect(rolled.json().colors).toEqual({ p1: 'emerald', p2: 'rose' });

    // The live stream's first snapshot carries them as well.
    const socket = await app.injectWS(`/games/${id}/stream`);
    const first = await new Promise<{ colors: Record<string, string> }>((resolve) => {
      socket.on('message', (data: Buffer) => resolve(JSON.parse(data.toString())));
    });
    expect(first.colors).toEqual({ p1: 'emerald', p2: 'rose' });
    await socket.terminate();
  });

  it('rejects a create-time colour outside the palette (INVALID_COLOR, 400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'cantstop', players: [{ name: 'Ann', color: 'indigo' }, { name: 'Bob' }] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_COLOR');
  });

  it('rejects two create-time seats picking the same colour (COLOR_TAKEN, 409)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'cantstop', players: [{ name: 'Ann', color: 'amber' }, { name: 'Bob', color: 'amber' }] },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('COLOR_TAKEN');
  });

  it('carries colours into a rematch (same table, same colours)', async () => {
    // An all-bot Can't Stop game finishes on create (given an rng that lets a bot win), then a watcher
    // restarts it in one click — and the same colours must ride into the fresh game, like bot seats do.
    const botApp = buildApp({ db: createDatabase(), rng: mulberry32(0xc0ffee) });
    await botApp.ready();
    const created = await botApp.inject({
      method: 'POST',
      url: '/games',
      payload: {
        gameType: 'cantstop',
        players: [{ name: 'Ann', bot: true, color: 'amber' }, { name: 'Bob', bot: true, color: 'emerald' }],
      },
    });
    const id = created.json().game.id as string;
    expect(created.json().game.status).toBe('ended');
    expect(created.json().colors).toEqual({ p1: 'amber', p2: 'emerald' });

    const res = await botApp.inject({ method: 'POST', url: `/games/${id}/rematch`, payload: { controlledIds: null } });
    const newId = res.json().rematch.newGameId as string;
    expect(newId).toBeTruthy();
    const fresh = await botApp.inject({ method: 'GET', url: `/games/${newId}` });
    expect(fresh.json().colors).toEqual({ p1: 'amber', p2: 'emerald' });
    await botApp.close();
  });

  it('synthesises palette-order defaults for an old game with no colour rows', async () => {
    // Simulate a pre-feature game: create one, then delete its colour rows as if it predated the table.
    const id = (
      await app.inject({
        method: 'POST',
        url: '/games',
        payload: { gameType: 'cantstop', players: [{ name: 'Ann' }, { name: 'Bob' }] },
      })
    ).json().game.id as string;
    db.prepare('DELETE FROM game_colors WHERE game_id = ?').run(id);
    const got = await app.inject({ method: 'GET', url: `/games/${id}` });
    // Nothing on the wire is colour-less — defaults come back from palette order.
    expect(got.json().colors).toEqual({ p1: 'rose', p2: 'sky' });
  });
});
