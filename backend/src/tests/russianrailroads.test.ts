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

  it('resolves a track-extension lock one MOVE_TRACK at a time over /actions', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const first = await activeOf(game.id);
    // Place on the 2-worker wood space → a 3-move lock; the placer keeps the turn.
    const placed = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: first, action: { type: 'PLACE', space: 'track-wood-2' } },
    });
    expect(placed.statusCode).toBe(200);
    const afterPlace = placed.json().game as { pendingMoves: { remaining: number } | null; activePlayerId?: string };
    expect(afterPlace.pendingMoves).toEqual({ remaining: 3, colors: ['wood'] });
    // Everything but MOVE_TRACK is refused while the lock is set.
    const refused = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: first, action: { type: 'PASS' } },
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('MOVES_PENDING');
    // Two of the three moves on two different routes.
    for (const route of ['transsiberian', 'kyiv']) {
      const step = await app.inject({
        method: 'POST',
        url: `/games/${game.id}/actions`,
        payload: { playerId: first, action: { type: 'MOVE_TRACK', route } },
      });
      expect(step.statusCode).toBe(200);
    }
    // Third move completes the lock and passes the turn to Bob.
    const last = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: first, action: { type: 'MOVE_TRACK', route: 'stpetersburg' } },
    });
    const done = last.json().game as {
      pendingMoves: unknown;
      players: { id: string; routes: { id: string; spaces: (string | null)[] }[] }[];
    };
    expect(done.pendingMoves).toBeNull();
    const ts = done.players.find((p) => p.id === first)!.routes.find((r) => r.id === 'transsiberian')!;
    expect(ts.spaces[1]).toBe('wood'); // the wood track advanced to space 2
    expect(await activeOf(game.id)).not.toBe(first);
  });

  it('runs the scoring phase at round close and carries the per-player total on the wire', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    // Both players pass to close round 1; wood-only, so everyone scores 0, but the phase runs.
    for (let i = 0; i < 2; i += 1) {
      const who = await activeOf(game.id);
      await app.inject({
        method: 'POST',
        url: `/games/${game.id}/actions`,
        payload: { playerId: who, action: { type: 'PASS' } },
      });
    }
    const view = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as {
      round: number;
      players: { id: string; score: number }[];
      log: { type: string; payload?: { closedRound?: number; scores?: unknown[] } }[];
    };
    expect(view.round).toBe(2);
    expect(view.players.every((p) => p.score === 0)).toBe(true);
    const close = view.log.find((e) => e.type === 'PASS' && e.payload?.closedRound === 1);
    expect(close?.payload?.scores).toHaveLength(2);
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
