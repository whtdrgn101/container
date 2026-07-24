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

  it('takes a doubler over the wire, drawing down the shared supply (pg. 14)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const first = await activeOf(game.id);
    const placed = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: first, action: { type: 'PLACE', space: 'doubler' } },
    });
    expect(placed.statusCode).toBe(200);
    const view = placed.json().game as {
      supplies: { doublers: number };
      players: { id: string; doublers: number }[];
    };
    expect(view.supplies.doublers).toBe(29); // one tile left the shared supply of 30
    expect(view.players.find((p) => p.id === first)!.doublers).toBe(1);
  });

  it('unlocks green over the wire once the wood track reaches space 2, then builds it (pg. 8–9)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const first = await activeOf(game.id);
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });

    // Advance the wood track on the Trans-Siberian to space 3 (≥ the pg. 8 space-2 green threshold): the
    // 1-worker wood space grants 2 moves, spent on that route.
    await post(first, { type: 'PLACE', space: 'track-wood-1' });
    await post(first, { type: 'MOVE_TRACK', route: 'transsiberian' });
    await post(first, { type: 'MOVE_TRACK', route: 'transsiberian' }); // lock clears, turn passes to Bob
    const second = await activeOf(game.id);
    expect(second).not.toBe(first);
    await post(second, { type: 'PASS' }); // hand the turn back to Ann

    // Green is now accessible: the dedicated green space is playable, and MOVE_TRACK builds green track.
    const greenPlace = await post(first, { type: 'PLACE', space: 'track-green-1' });
    expect(greenPlace.statusCode).toBe(200);
    expect((greenPlace.json().game as { pendingMoves: unknown }).pendingMoves).toEqual({
      remaining: 2,
      colors: ['green'],
    });
    const built = await post(first, { type: 'MOVE_TRACK', route: 'transsiberian', color: 'green' });
    expect(built.statusCode).toBe(200);
    const ts = (
      built.json().game as { players: { id: string; routes: { id: string; spaces: (string | null)[] }[] }[] }
    ).players
      .find((p) => p.id === first)!
      .routes.find((r) => r.id === 'transsiberian')!;
    expect(ts.spaces[0]).toBe('green'); // a new colour enters at space 1 (pg. 9)
  });

  it('acquires a locomotive and drives an upgrade chain over the wire (pg. 10–11)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const first = await activeOf(game.id);
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });

    // Place on the 1-worker loco space → acquire the lowest (#2) and open the pending-loco lock; turn kept.
    const acquired = await post(first, { type: 'PLACE', space: 'loco-1' });
    expect(acquired.statusCode).toBe(200);
    const afterAcquire = acquired.json().game as {
      pendingLoco: { number: number } | null;
      supplies: { locomotives: { stacks: Record<number, number>; returnedFactories: number } };
      activePlayerId?: string;
    };
    expect(afterAcquire.pendingLoco).toEqual({ number: 2 });
    expect(afterAcquire.supplies.locomotives.stacks[2]).toBe(1); // one #2 left the 2-player stack

    // Everything but a loco resolution is refused while the lock is set.
    const refused = await post(first, { type: 'PASS' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('LOCO_PENDING');

    // Upgrade the starting #1 on the Trans-Siberian with the #2 → the #1 cascades into the lock.
    const upgraded = await post(first, { type: 'REPLACE_LOCO', route: 'transsiberian', number: 1 });
    expect(upgraded.statusCode).toBe(200);
    expect((upgraded.json().game as { pendingLoco: { number: number } }).pendingLoco).toEqual({ number: 1 });

    // Place the displaced #1 on an empty route (Kyiv): the chain ends and the turn passes to Bob.
    const placed = await post(first, { type: 'PLACE_LOCO', route: 'kyiv' });
    expect(placed.statusCode).toBe(200);
    const done = placed.json().game as {
      pendingLoco: unknown;
      players: { id: string; locomotives: { number: number; route: string }[] }[];
    };
    expect(done.pendingLoco).toBeNull();
    const locos = done.players.find((p) => p.id === first)!.locomotives;
    expect(locos).toContainEqual({ number: 2, route: 'transsiberian' });
    expect(locos).toContainEqual({ number: 1, route: 'kyiv' });
    expect(await activeOf(game.id)).not.toBe(first);
  });

  it('builds a factory, then moves the wrench onto it for a pool action (pg. 12–13)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });
    const industryOf = async (playerId: string) => {
      const g = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as {
        players: { id: string; industry: { wrench: number; factories: (number | null)[] }; actionPool: unknown[] }[];
      };
      return g.players.find((p) => p.id === playerId)!;
    };

    const X = await activeOf(game.id); // the round-1 opener keeps the clock once the other passes
    const Y = X === 'p1' ? 'p2' : 'p1';

    // X builds a factory from the lowest locomotive (#2) into the first gap, ending its turn.
    await post(X, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    const built = await post(X, { type: 'PLACE_FACTORY' });
    expect(built.statusCode).toBe(200);
    expect((await industryOf(X)).industry.factories[0]).toBe(2);

    // Y passes → X now holds the turn for the rest of the round; advance the wrench to the 5-space (lane 4),
    // just before the (now-filled) first gap. industry-3 grants a wood pool credit, which X forfeits.
    await post(Y, { type: 'PASS' });
    await post(X, { type: 'PLACE', space: 'industry-2' }); // wrench 0 → 2
    await post(X, { type: 'PLACE', space: 'industry-1' }); // → 3
    await post(X, { type: 'PLACE', space: 'industry-3' }); // → 4 (+ a wood credit)
    await post(X, { type: 'SKIP_POOL' });
    expect((await industryOf(X)).industry.wrench).toBe(4);
    await post(X, { type: 'PASS' }); // close round 1 → round 2 opens with X again

    // Round 2: advancing 1 moves the wrench ONTO the #2 factory → its move-a-track action enters the pool.
    const onto = await post(X, { type: 'PLACE', space: 'industry-1' });
    expect(onto.statusCode).toBe(200);
    const afterOnto = onto.json().game as {
      players: { id: string; industry: { wrench: number }; actionPool: { id: string }[] }[];
      activePlayerIndex: number;
    };
    const xView = afterOnto.players.find((p) => p.id === X)!;
    expect(xView.industry.wrench).toBe(5); // moved onto the factory
    expect(xView.actionPool).toEqual([{ id: 'factory:2#0', count: 1, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] }]);
    expect(afterOnto.players[afterOnto.activePlayerIndex]!.id).toBe(X); // turn kept to resolve the pool

    // A non-pool move is refused; resolving the credit opens the track lock, and a MOVE_TRACK spends it.
    const refused = await post(X, { type: 'PASS' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('POOL_PENDING');
    const resolving = await post(X, { type: 'RESOLVE_POOL', id: 'factory:2#0' });
    expect((resolving.json().game as { pendingMoves: unknown }).pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
    const spent = await post(X, { type: 'MOVE_TRACK', route: 'transsiberian' });
    expect((spent.json().game as { pendingMoves: unknown }).pendingMoves).toBeNull();
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
