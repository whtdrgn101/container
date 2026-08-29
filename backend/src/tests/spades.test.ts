import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HAND_SIZE, MIN_PLAYERS, SEAT_COLORS } from '@game-hub/game-spades/engine';
import type { SpadesView } from '@game-hub/game-spades/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Spades over REST — game 9, installed as compiled `dist/`; nothing here compiles it.
 *
 * It earns a file of its own for a redaction nothing else on the hub does: during the **blind-nil
 * offer**, `viewFor` hides *every* hand — the viewer's own included (the game's ruling R11). Every other
 * hidden-information game here hides other people's cards from you; this one has a phase where you may
 * not see your own, because a bid made "before looking" is meaningless if the wire carries your hand.
 * That is exactly the kind of thing that passes a unit test and leaks through a host, so it is checked
 * here, on the real response body.
 */
describe('Spades over REST — bids aloud, and a phase where nobody sees their own hand', () => {
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

  const create = async (payload: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/games', payload: { gameType: 'spades', players: FOUR, ...payload } });

  const read = async (id: string, viewer?: string) =>
    (await app.inject({ method: 'GET', url: `/games/${id}${viewer ? `?viewer=${viewer}` : ''}` })).json() as {
      game: SpadesView;
    };

  it('appears in the catalog with its fixed seat count and its house rules', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
      tableOptions?: { id: string; default: unknown }[];
    }[];
    const spades = catalog.find((game) => game.id === 'spades')!;
    expect(spades.minPlayers).toBe(MIN_PLAYERS);
    expect(spades.maxPlayers).toBe(MIN_PLAYERS);
    expect(spades.colors).toEqual([...SEAT_COLORS]);
    expect(spades.tableOptions?.map((spec) => spec.id)).toEqual(['blindNil', 'target']);
    expect(spades.tableOptions?.map((spec) => spec.default)).toEqual([false, '500']);
  });

  it('deals the whole deck — thirteen each, nothing left over', async () => {
    const created = await create();
    expect(created.statusCode).toBe(201);
    const game = created.json().game as SpadesView;
    expect(game.players.map((player) => player.handCount)).toEqual([HAND_SIZE, HAND_SIZE, HAND_SIZE, HAND_SIZE]);
    expect(game.phase).toBe('bidding');
    // Hand 1 never opens with a blind-nil offer: nobody can be 100 behind at 0–0 (the game's ruling R5).
    expect(game.activePlayerIndex).toBe(1);
  });

  it('refuses a table that is not exactly four', async () => {
    expect((await create({ players: FOUR.slice(0, 3) })).statusCode).toBe(400);
  });

  it('carries the table’s house rules into the dealt game, and rejects an illegal pick', async () => {
    const game = (await create({ options: { blindNil: true, target: '200' } })).json().game as SpadesView;
    expect(game.blindNilAllowed).toBe(true);
    expect(game.targetScore).toBe(200);

    const bad = await create({ options: { target: '1000' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('INVALID_TABLE_OPTION');
  });

  it('takes a bid through the action route, and publishes it (the game’s ruling R3)', async () => {
    const id = ((await create()).json().game as SpadesView).id;
    const bid = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'BID', bid: 4 } },
    });
    expect(bid.statusCode).toBe(200);
    const game = bid.json().game as SpadesView;
    expect(game.players[1]!.bid).toBe(4);
    // A bid is public the moment it is made — even a spectator sees it.
    const spectated = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=` })).json() as { game: SpadesView };
    expect(spectated.game.players[1]!.bid).toBe(4);
  });

  it('rejects a bid outside 0–13 before the engine ever sees it', async () => {
    const id = ((await create()).json().game as SpadesView).id;
    const bad = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'BID', bid: 14 } },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('maps an out-of-turn move to a 409 and an unknown player to a 404', async () => {
    const id = ((await create()).json().game as SpadesView).id;
    const early = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p3', action: { type: 'BID', bid: 1 } },
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('NOT_YOUR_TURN');

    const stranger = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'nobody', action: { type: 'BID', bid: 1 } },
    });
    expect(stranger.statusCode).toBe(404);
  });

  describe('⚠️ redaction', () => {
    it('shows a viewer only their own hand', async () => {
      const id = ((await create()).json().game as SpadesView).id;
      const { game } = await read(id, 'p1');
      expect(game.players[0]!.hand).toHaveLength(HAND_SIZE);
      expect(game.players.slice(1).every((player) => player.hand === null)).toBe(true);
    });

    it('never puts the deck seed on the wire, to anyone', async () => {
      const id = ((await create()).json().game as SpadesView).id;
      for (const viewer of [undefined, 'p1', 'p3']) {
        const raw = await app.inject({ method: 'GET', url: `/games/${id}${viewer ? `?viewer=${viewer}` : ''}` });
        expect(raw.body).not.toContain('deckSeed');
      }
    });

    it('⚠️ hides EVERY hand during the blind-nil offer, the viewer’s own included (ruling R11)', async () => {
      // Reach the offer by editing the stored snapshot: a side has to be 100 behind, which takes a whole
      // hand to arrange through play, and the redaction is what is under test — not how we got there.
      const id = ((await create({ options: { blindNil: true } })).json().game as SpadesView).id;
      const row = db.prepare('SELECT state FROM games WHERE id = ?').get(id) as { state: string };
      const stored = JSON.parse(row.state) as Record<string, unknown>;
      stored['scores'] = [200, 0];
      stored['phase'] = 'blind';
      stored['activePlayerIndex'] = 1;
      db.prepare('UPDATE games SET state = ? WHERE id = ?').run(JSON.stringify(stored), id);

      const raw = await app.inject({ method: 'GET', url: `/games/${id}?viewer=p2` });
      const { game } = raw.json() as { game: SpadesView };
      expect(game.phase).toBe('blind');
      // Not one hand is on the wire — including p2's, the seat doing the asking.
      expect(game.players.every((player) => player.hand === null)).toBe(true);
      expect(game.players.every((player) => player.handCount === HAND_SIZE)).toBe(true);
      // Belt and braces: no card at all appears in the response body.
      expect(/"[2-9TJQKA][CDHS]"/.test(raw.body)).toBe(false);
    });
  });

  describe('a lobby agrees its house rules when the room is opened', () => {
    it('deals the game with the options the room was created with', async () => {
      const lobby = (
        await app.inject({
          method: 'POST',
          url: '/lobbies',
          payload: { gameType: 'spades', seats: 4, options: { target: '200', blindNil: true } },
        })
      ).json().lobby as { id: string };

      for (const name of ['Ann', 'Bo', 'Cy', 'Di']) {
        await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/join`, payload: { name } });
      }
      const started = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
      expect(started.statusCode).toBe(201);
      const game = started.json().game as SpadesView;
      expect(game.targetScore).toBe(200);
      expect(game.blindNilAllowed).toBe(true);
    });
  });
});
