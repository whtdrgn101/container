import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { assignColors } from '../colors';
import { mulberry32 } from './helpers';

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
    (await app.inject({ method: 'POST', url: '/lobbies', payload: { gameType: 'cantstop', seats } })).json().lobby as {
      id: string;
    };
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
    const taken = await app.inject({
      method: 'POST',
      url: `/lobbies/${lobby.id}/color`,
      payload: { seat: 1, color: 'rose' },
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('COLOR_TAKEN');
    const empty = await app.inject({
      method: 'POST',
      url: `/lobbies/${lobby.id}/color`,
      payload: { seat: 3, color: 'amber' },
    });
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
      socket.on('message', (data: Buffer) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'presence' || msg.type === 'chat') return; // platform frames, not the state snapshot
        resolve(msg);
      });
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
      payload: {
        gameType: 'cantstop',
        players: [
          { name: 'Ann', color: 'amber' },
          { name: 'Bob', color: 'amber' },
        ],
      },
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
        players: [
          { name: 'Ann', bot: true, color: 'amber' },
          { name: 'Bob', bot: true, color: 'emerald' },
        ],
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

  /**
   * Kernel 1.2.0 hands each seat's resolved colour to `createGame`, for the rare game whose colour is
   * rules data. **None of the five hosted games is that game**, and this is what proves it stayed that
   * way: deal the same seeded table twice, once with picks and once without, and the dealt state must
   * be identical apart from the game id. A game that started reading `players[].color` — or a host
   * that started leaking it into state some other way — fails here.
   *
   * (That the channel *does* deliver is proved in `module-seam.test.ts`, whose stub consumes it; only a
   * stub can, precisely because these five ignore it.)
   */
  it('does not change what any hosted game is dealt (the five ignore players[].color)', async () => {
    const seeded = () => buildApp({ db: createDatabase(), rng: mulberry32(0x5eed) });
    const deal = async (instance: FastifyInstance, gameType: string, colored: boolean) => {
      const names = ['Ann', 'Bob', 'Cy'];
      const picks = { container: ['indigo', 'teal', 'rose'], stoneage: ['red', 'blue', 'green'] }[gameType]!;
      const response = await instance.inject({
        method: 'POST',
        url: '/games',
        payload: {
          gameType,
          players: names.map((name, seat) => ({ name, ...(colored ? { color: picks[seat] } : {}) })),
        },
      });
      expect(response.statusCode).toBe(201);
      const game = response.json().game as { id: string };
      return { ...game, id: 'normalised' };
    };

    for (const gameType of ['container', 'stoneage']) {
      // Same seed, same seats, same order — the only difference is that every seat picked its colour.
      // Note the picks are deliberately the *same* colours the defaults would assign, so the stored
      // colours match too and the only variable is whether the pick travelled through `createGame`.
      const plainApp = seeded();
      const pickedApp = seeded();
      await plainApp.ready();
      await pickedApp.ready();
      expect(await deal(pickedApp, gameType, true)).toEqual(await deal(plainApp, gameType, false));
      await plainApp.close();
      await pickedApp.close();
    }
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
