import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MIN_PLAYERS, SEAT_COLORS } from '@game-hub/game-euchre/engine';
import type { EuchreView } from '@game-hub/game-euchre/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Euchre over REST — game 8, installed as compiled `dist/`; nothing here compiles it.
 *
 * It earns a file of its own because it is the **first hosted game to declare table options** (kernel
 * 1.5.0). Everything else about it is the routine shape Track D was aiming at, but the option channel is
 * new, and the honest test of it is exactly this: pick house rules over HTTP and check they reached the
 * *engine* — a channel that validated picks and then dropped them would pass every unit test in the
 * kernel and the game repo alike.
 *
 * It is also the first hosted game with a **fixed** seat count (exactly four, in partnerships), so the
 * seat-bound rejection is worth driving through the real core.
 */
describe('Euchre over REST — the first game with table options', () => {
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

  const FOUR = [{ name: 'Ann' }, { name: 'Bo' }, { name: 'Cy' }, { name: 'Di' }];

  const create = async (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/games', payload: { gameType: 'euchre', ...payload } });

  const read = async (id: string, viewer?: string) =>
    (await app.inject({ method: 'GET', url: `/games/${id}${viewer ? `?viewer=${viewer}` : ''}` })).json() as {
      game: EuchreView;
    };

  it('appears in the catalog with its palette, its fixed seat count and its house rules', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
      tableOptions?: { id: string; type: string; default: unknown }[];
    }[];
    const euchre = catalog.find((game) => game.id === 'euchre')!;
    expect(euchre.minPlayers).toBe(MIN_PLAYERS);
    expect(euchre.maxPlayers).toBe(MIN_PLAYERS); // exactly four, in two partnerships
    expect(euchre.colors).toEqual([...SEAT_COLORS]);
    // The declaration the generic setup form is built from.
    expect(euchre.tableOptions?.map((spec) => spec.id)).toEqual(['stickTheDealer', 'defenderAlone', 'target']);
    expect(euchre.tableOptions?.map((spec) => spec.default)).toEqual([false, false, '10']);
  });

  it('deals a four-handed game with five cards each', async () => {
    const created = await create({ players: FOUR });
    expect(created.statusCode).toBe(201);
    const game = created.json().game as EuchreView;
    expect(game.players).toHaveLength(4);
    expect(game.players.map((player) => player.handCount)).toEqual([5, 5, 5, 5]);
    // Seat 0 deals, so the dealer's left is on the clock (the game repo's ruling R4).
    expect(game.dealerIndex).toBe(0);
    expect(game.activePlayerIndex).toBe(1);
    expect(game.upcard).not.toBeNull();
  });

  it('refuses a table that is not exactly four', async () => {
    expect((await create({ players: FOUR.slice(0, 3) })).statusCode).toBe(400);
    expect((await create({ players: [...FOUR, { name: 'Ed' }] })).statusCode).toBe(400);
  });

  describe('⚠️ table options reach the engine (kernel 1.5.0)', () => {
    it('carries the table’s picks all the way into the dealt game', async () => {
      const created = await create({
        players: FOUR,
        options: { stickTheDealer: true, target: '11', defenderAlone: true },
      });
      expect(created.statusCode).toBe(201);
      const game = created.json().game as EuchreView;
      // These are read off the *projected view*, which means they made it through createGame into state.
      expect(game.stickTheDealer).toBe(true);
      expect(game.defenderAloneAllowed).toBe(true);
      expect(game.targetScore).toBe(11);
    });

    it('deals the game’s own defaults when the client sends no options', async () => {
      const game = (await create({ players: FOUR })).json().game as EuchreView;
      expect(game.stickTheDealer).toBe(false);
      expect(game.defenderAloneAllowed).toBe(false);
      expect(game.targetScore).toBe(10);
    });

    it('rejects a pick the game never declared, and an illegal value', async () => {
      const unknown = await create({ players: FOUR, options: { screwTheDealer: true } });
      expect(unknown.statusCode).toBe(400);
      expect(unknown.json().error.code).toBe('INVALID_TABLE_OPTION');

      const badValue = await create({ players: FOUR, options: { target: '21' } });
      expect(badValue.statusCode).toBe(400);
      expect(badValue.json().error.message).toContain('10, 11');
    });

    it('survives a round trip through SQLite — an option is rules data, persisted with the state', async () => {
      const id = ((await create({ players: FOUR, options: { target: '11' } })).json().game as EuchreView).id;
      // Re-read from the database rather than the create response.
      expect((await read(id)).game.targetScore).toBe(11);
    });
  });

  describe('⚠️ redaction', () => {
    it('shows a viewer only their own hand', async () => {
      const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
      const { game } = await read(id, 'p1');
      expect(game.players[0]!.hand).toHaveLength(5);
      expect(game.players.slice(1).every((player) => player.hand === null)).toBe(true);
      // The count is public — you can see how many cards are in someone's hand at a table.
      expect(game.players.map((player) => player.handCount)).toEqual([5, 5, 5, 5]);
    });

    it('defaults a viewer-less read to the seat on the clock — the hotseat convention', async () => {
      // `GET /games/:id` with no `?viewer=` projects for the *active* seat (`viewerFrom`), which is what
      // makes pass-and-play work: one device, and the cards follow the turn. Pinned here because it is a
      // platform rule a game inherits rather than one Euchre chose.
      const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
      const { game } = await read(id);
      expect(game.players[game.activePlayerIndex]!.hand).toHaveLength(5);
      expect(game.players.filter((player) => player.hand !== null)).toHaveLength(1);
    });

    it('shows a genuine spectator nobody’s hand', async () => {
      // An explicitly *empty* viewer is the spectator case — `''.split(',').filter(Boolean)` is `[]`.
      const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
      const { game } = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=` })).json() as {
        game: EuchreView;
      };
      expect(game.players.every((player) => player.hand === null)).toBe(true);
    });

    it('never puts the deck seed or the kitty on the wire, to anyone', async () => {
      const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
      for (const viewer of [undefined, 'p1', 'p3']) {
        const raw = await app.inject({ method: 'GET', url: `/games/${id}${viewer ? `?viewer=${viewer}` : ''}` });
        expect(raw.body).not.toContain('deckSeed');
        expect(raw.body).not.toContain('kitty');
      }
    });
  });

  it('plays a bid through the action route', async () => {
    const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
    const passed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'PASS' } },
    });
    expect(passed.statusCode).toBe(200);
    expect((passed.json().game as EuchreView).activePlayerIndex).toBe(2);
  });

  it('maps an out-of-turn move to a 409 and an unknown player to a 404', async () => {
    const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
    const early = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p3', action: { type: 'PASS' } },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('NOT_YOUR_TURN');

    const stranger = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'nobody', action: { type: 'PASS' } },
    });
    expect(stranger.statusCode).toBe(404);
  });

  it('rejects a card that is not in a Euchre deck before the engine ever sees it', async () => {
    const id = ((await create({ players: FOUR })).json().game as EuchreView).id;
    const bad = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'PLAY', card: '2C' } },
    });
    expect(bad.statusCode).toBe(400);
  });

  describe('a lobby agrees its house rules when the room is opened', () => {
    it('deals the game with the options the room was created with', async () => {
      const lobby = (
        await app.inject({
          method: 'POST',
          url: '/lobbies',
          payload: { gameType: 'euchre', seats: 4, options: { target: '11', stickTheDealer: true } },
        })
      ).json().lobby as { id: string };

      for (const name of ['Ann', 'Bo', 'Cy', 'Di']) {
        await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/join`, payload: { name } });
      }
      const started = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
      expect(started.statusCode).toBe(201);
      const game = started.json().game as EuchreView;
      expect(game.targetScore).toBe(11);
      expect(game.stickTheDealer).toBe(true);
    });
  });
});
