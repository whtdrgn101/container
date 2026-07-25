import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { LAST_ROUND_INDUSTRY_ID, legalActions } from '@game-hub/game-russianrailroads/engine';
import type { Action, RussianRailroadsResult, RussianRailroadsState } from '@game-hub/game-russianrailroads/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Russian Railroads over REST — the platform proof that a **fifth** game registers and plays, and the
 * **Track D pilot**: this game is hosted from its own in-workspace package (`@game-hub/game-russianrailroads`)
 * rather than a folder in the backend, so it exercises the package-shaped `GameModule` end-to-end. The
 * standing interest is the same as every game's: redaction (the end-bonus pile order) holds on the wire.
 */
/** A deterministic mulberry32 rng so the engineer deal is reproducible over the wire (pg. 5). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Russian Railroads (Track D package)', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    // Seed 1: the engineer deal is deterministic — the hiring space holds #10 (scoreLocomotives) and the
    // left variable action space #4 (moveTrack), which the engineer tests below rely on.
    app = buildApp({ db, rng: makeRng(1) });
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

  /**
   * Resolve the RR6 starting-bonus setup mini-phase (pg. 6) so a test reaches round-1 placement. Each owing
   * seat takes the coins-only card (no lingering lock). Idempotent — a no-op once setup is done.
   */
  const clearSetup = async (id: string) => {
    for (let guard = 0; guard < 6; guard += 1) {
      const g = (await app.inject({ method: 'GET', url: `/games/${id}` })).json().game as {
        pendingSetupBonus: number[] | null;
        activePlayerIndex: number;
        players: { id: string }[];
      };
      if (!g.pendingSetupBonus) return;
      await app.inject({
        method: 'POST',
        url: `/games/${id}/actions`,
        payload: {
          playerId: g.players[g.activePlayerIndex]!.id,
          action: { type: 'RESOLVE_SETUP_BONUS', card: 'start-coins-2' },
        },
      });
    }
  };

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
    await clearSetup(game.id);
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
    await clearSetup(game.id);
    const view = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as Record<
      string,
      unknown
    >;
    expect(view['endBonusPile']).toBeUndefined();
    expect(typeof view['endBonusPileCount']).toBe('number');
    // Opponents' held end-bonus cards are counts only (redacted to null; the owner sees its own list).
    const players = view['players'] as { id: string; endBonusCards: unknown; endBonusHeld: number }[];
    expect(players.find((p) => p.id === 'p1')!.endBonusCards).toEqual([]); // owner sees its own (empty) list
    expect(players.find((p) => p.id === 'p2')!.endBonusCards).toBeNull(); // opponent redacted
    expect(players.every((p) => p.endBonusHeld === 0)).toBe(true);
  });

  it('resolves a track-extension lock one MOVE_TRACK at a time over /actions', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
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
    await clearSetup(game.id);
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
    const close = view.log.find((e) => e.type === 'PASS' && e.payload?.closedRound === 1);
    expect(close?.payload?.scores).toHaveLength(2);
    // Route+industry scoring is 0 this round (wood only); pass-card reverses are the only points (pg. 16).
    expect((close?.payload?.scores as { gained: number }[]).every((s) => s.gained === 0)).toBe(true);
  });

  it('takes a doubler over the wire, drawing down the shared supply (pg. 14)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
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
    await clearSetup(game.id);
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
    await clearSetup(game.id);
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
    await clearSetup(game.id);
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
    expect(xView.actionPool).toEqual([
      { id: 'factory:2#0', count: 1, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] },
    ]);
    expect(afterOnto.players[afterOnto.activePlayerIndex]!.id).toBe(X); // turn kept to resolve the pool

    // A non-pool move is refused; resolving the credit opens the track lock, and a MOVE_TRACK spends it.
    const refused = await post(X, { type: 'PASS' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('POOL_PENDING');
    const resolving = await post(X, { type: 'RESOLVE_POOL', id: 'factory:2#0' });
    expect((resolving.json().game as { pendingMoves: unknown }).pendingMoves).toEqual({
      remaining: 1,
      colors: ['wood'],
    });
    const spent = await post(X, { type: 'MOVE_TRACK', route: 'transsiberian' });
    expect((spent.json().game as { pendingMoves: unknown }).pendingMoves).toBeNull();
  });

  it('scores the turn-order card reverse when a player passes (pg. 16)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
    const g0 = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as {
      activePlayerIndex: number;
      players: { id: string; turnOrderCard: number }[];
    };
    const active = g0.players[g0.activePlayerIndex]!;
    const passed = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: active.id, action: { type: 'PASS' } },
    });
    const expected = ({ 1: 0, 2: 2, 3: 4, 4: 6 } as Record<number, number>)[active.turnOrderCard];
    expect(
      (passed.json().game as { log: { type: string; payload?: { passScore?: number } }[] }).log.at(-1),
    ).toMatchObject({
      type: 'PASS',
      payload: { passScore: expected },
    });
  });

  it('reaches a route end for a key and resolves the choice over the wire (pg. 18–19)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });
    const A = await activeOf(game.id);
    const B = A === 'p1' ? 'p2' : 'p1';

    // Drive A's Kyiv wood track from space 1 to its end (space 9) — 8 moves across four track spaces — so the
    // wood-only new-worker (space 7) then the end-station key (space 9) fire.
    const buildKyiv = async (space: string, coins: number, moves: number) => {
      await post(A, coins ? { type: 'PLACE', space } : { type: 'PLACE', space });
      for (let i = 0; i < moves; i += 1) await post(A, { type: 'MOVE_TRACK', route: 'kyiv', color: 'wood' });
    };
    await buildKyiv('track-wood-2', 0, 3); // → space 4; turn passes to B
    await post(B, { type: 'PASS' }); // B done → A keeps the clock alone
    await buildKyiv('track-wood-1', 0, 2); // → space 6
    await buildKyiv('track-coin', 1, 2); // (worker + coin) → space 8; the new-worker at space 7 fires
    // The bottom space's last move reaches space 9 (the end) → a key is owed.
    await post(A, { type: 'PLACE', space: 'track-bottom' });
    const owed = await post(A, { type: 'MOVE_TRACK', route: 'kyiv', color: 'wood' });
    const owedView = owed.json().game as {
      pendingKey: { remaining: number } | null;
      players: { id: string; workersTotal: number; keysReceived: number }[];
    };
    expect(owedView.pendingKey).toEqual({ remaining: 1 });
    expect(owedView.players.find((p) => p.id === A)!.workersTotal).toBeGreaterThan(5); // the new worker was gained
    expect(owedView.players.find((p) => p.id === A)!.keysReceived).toBe(1);

    // Everything but RESOLVE_KEY is refused; scoring 10 points resolves it.
    const refused = await post(A, { type: 'PASS' });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('KEY_PENDING');
    const scored = await post(A, { type: 'RESOLVE_KEY', option: 'points' });
    const done = scored.json().game as { pendingKey: unknown; players: { id: string; score: number }[] };
    expect(done.pendingKey).toBeNull();
    expect(done.players.find((p) => p.id === A)!.score).toBe(10);
  });

  it('runs the between-round reuse mini-phase over the wire (pg. 17)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });
    const A = await activeOf(game.id);
    const B = A === 'p1' ? 'p2' : 'p1';

    // The first player claims second place, then both pass → the round closes into the reuse mini-phase.
    await post(A, { type: 'PLACE', space: 'turnorder-2' });
    await post(B, { type: 'PASS' });
    await post(A, { type: 'PASS' });
    const inReuse = (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as {
      pendingReuse: number[] | null;
      round: number;
    };
    expect(inReuse.pendingReuse).not.toBeNull();
    expect(inReuse.round).toBe(2);

    // The claimant reuses its worker on the coins space; the gain is available for the new round.
    const reuseSeat = await activeOf(game.id);
    const resolved = await post(reuseSeat, { type: 'RESOLVE_REUSE', space: 'coins' });
    const after = resolved.json().game as { pendingReuse: number[] | null };
    expect(after.pendingReuse).toBeNull();
  });

  it('hires the round-1 engineer for a coin, then uses its action next round (pg. 15)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
    const post = (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${game.id}/actions`, payload: { playerId, action } });
    const viewOf = async () =>
      (await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1` })).json().game as {
        round: number;
        activePlayerIndex: number;
        engineerStrip: ({ id: string; number: number } | null)[];
        players: {
          id: string;
          coins: number;
          score: number;
          hiredEngineers: { id: string }[];
          usedEngineers: string[];
        }[];
      };

    const A = await activeOf(game.id);
    const B = A === 'p1' ? 'p2' : 'p1';
    const before = await viewOf();
    const hiringEngineer = before.engineerStrip[before.engineerStrip.length - 1]!;
    expect(hiringEngineer.number).toBe(10); // the seeded deal

    // A hires the hiring-space engineer for 1 coin → it joins A's board and leaves the strip; turn passes.
    const hired = await post(A, { type: 'HIRE_ENGINEER' });
    expect(hired.statusCode).toBe(200);
    const afterHire = hired.json().game as {
      engineerStrip: (unknown | null)[];
      players: { id: string; coins: number; hiredEngineers: { id: string }[] }[];
    };
    expect(afterHire.engineerStrip[afterHire.engineerStrip.length - 1]).toBeNull(); // slot emptied
    const aHired = afterHire.players.find((p) => p.id === A)!;
    expect(aHired.hiredEngineers.map((e) => e.id)).toEqual([hiringEngineer.id]);
    expect(aHired.coins).toBe(before.players.find((p) => p.id === A)!.coins - 1);

    // Close round 1 (B then A pass) → round 2 opens with A again; the engineer's per-round use flag reset.
    await post(B, { type: 'PASS' });
    await post(A, { type: 'PASS' });
    const round2 = await viewOf();
    expect(round2.round).toBe(2);
    expect(round2.players[round2.activePlayerIndex]!.id).toBe(A);
    const scoreBefore = round2.players.find((p) => p.id === A)!.score;

    // A uses the hired engineer (an indirect action, once per round) — #10 scores the sum of A's 2 highest
    // locomotives (just the starting #1 → +1) and marks it used this round.
    const used = await post(A, { type: 'USE_ENGINEER', engineerId: hiringEngineer.id });
    expect(used.statusCode).toBe(200);
    const afterUse = used.json().game as { players: { id: string; score: number; usedEngineers: string[] }[] };
    const aUse = afterUse.players.find((p) => p.id === A)!;
    expect(aUse.usedEngineers).toContain(hiringEngineer.id);
    expect(aUse.score).toBe(scoreBefore + 1);

    // Using it again the same round is refused.
    const again = await post(A, { type: 'USE_ENGINEER', engineerId: hiringEngineer.id });
    expect(again.statusCode).toBe(409);
  });

  it('uses a public variable engineer action space over the wire (pg. 15–16)', async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
    const A = await activeOf(game.id);
    // The left variable action space holds #4 (a track-move engineer, seeded): using it for 1 worker opens the
    // pending-moves lock directly (a direct action, must resolve) and occupies the space for the round.
    const used = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: A, action: { type: 'USE_VARIABLE_ENGINEER', slot: 0 } },
    });
    expect(used.statusCode).toBe(200);
    const view = used.json().game as {
      pendingMoves: { remaining: number; colors: string[] } | null;
      actionSpaces: Record<string, unknown[]>;
      players: { id: string; workersAvailable: number }[];
    };
    expect(view.pendingMoves).toEqual({ remaining: 2, colors: ['wood'] });
    expect(view.actionSpaces['engineer-var-0']).toHaveLength(1);
    expect(view.players.find((p) => p.id === A)!.workersAvailable).toBe(5); // 6 starting − 1
  });

  it("maps a wrong-turn move to 409, and reports the module's error code", async () => {
    const game = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    await clearSetup(game.id);
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

/**
 * RR8 — **full seeded games over REST**, at 2, 3 and 4 players, each driven to a real end (the SP7
 * hardening pattern, adapted). A single deterministic, *acquisitive* driver plays every game move-by-move
 * over HTTP (create → read the active seat's own view → POST an action → repeat). One seat (the round-1
 * opener) is the "focus" seat pursuing goals; the others pass, so the focus seat keeps the clock and drives
 * the whole board. Across the three games the driver reproducibly exercises the entire mechanic surface, and
 * the run **asserts** that coverage so a future change that makes a path unreachable fails loudly.
 *
 * Each game asserts: it (a) **ends** into final scoring, (b) has a **coherent breakdown** — every result's
 * `total === base + endBonus + majority`, and `winnerIds` are exactly the highest totals (ties share, pg.
 * 23) — (c) **version strictly increases** by one per applied action, and (d) the **move log** is a
 * contiguous `seq` 1..N of known action types, one per version.
 */
describe('Russian Railroads — full seeded games to a real end (RR8)', () => {
  /** Every action type Russian Railroads logs — used to prove no log entry is an unknown move. */
  const KNOWN_TYPES = new Set([
    'PLACE',
    'MOVE_TRACK',
    'PLACE_LOCO',
    'REPLACE_LOCO',
    'FLIP_LOCO',
    'PLACE_FACTORY',
    'REPLACE_FACTORY',
    'RESOLVE_POOL',
    'SKIP_POOL',
    'RESOLVE_KEY',
    'RESOLVE_IDEA_TOKEN',
    'RESOLVE_IDEA_CARD',
    'RESOLVE_REUSE',
    'RESOLVE_SETUP_BONUS',
    'HIRE_ENGINEER',
    'USE_ENGINEER',
    'USE_VARIABLE_ENGINEER',
    'PASS',
  ]);

  type Route = { id: string; spaces: (string | null)[] };
  type Player = {
    id: string;
    workersAvailable: number;
    coins: number;
    doublers: number;
    keysReceived: number;
    usedIdeaTokens: string[];
    hiredEngineers: { id: string; number: number; action: { kind: string } }[];
    usedEngineers: string[];
    industry: { wrench: number; factories: (number | null)[] };
    routes: Route[];
    actionPool: { id: string }[];
    score: number;
  };
  type View = {
    status: string;
    round: number;
    rounds: number;
    activePlayerIndex: number;
    players: Player[];
    engineerStrip: ({ number: number; action: { kind: string } } | null)[];
    pendingMoves: { remaining: number; colors: string[] } | null;
    pendingLoco: { number: number } | null;
    pendingFactory: { owed: true } | null;
    pendingKey: { remaining: number } | null;
    pendingIdeaToken: { spaceId: string } | null;
    pendingIdeaCard: { owed: true } | null;
    pendingReuse: number[] | null;
    pendingSetupBonus: number[] | null;
    version: number;
    results?: RussianRailroadsResult[];
    winnerIds?: string[];
    log: { type: string; seq: number; payload?: { passScore?: number } }[];
  };
  type Coverage = {
    trackLock: boolean;
    colorUnlock: boolean;
    doubler: boolean;
    locoChain: boolean;
    factoryPool: boolean;
    keyChoice: boolean;
    ideaToken: boolean;
    turnClaim: boolean;
    reuse: boolean;
    engineerHire: boolean;
    engineerUse: boolean;
    passScore: boolean;
  };

  /** The highest 0-based index of a non-null tile on a route (its frontier), or −1 if empty. */
  const frontier = (route: Route): number => {
    for (let i = route.spaces.length - 1; i >= 0; i -= 1) if (route.spaces[i] != null) return i;
    return -1;
  };
  const seatOf = (view: View, id: string): Player => view.players.find((p) => p.id === id)!;

  async function playToEnd(
    app: FastifyInstance,
    playerCount: number,
  ): Promise<{ ended: View; cover: Coverage; steps: number }> {
    const names = [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }].slice(0, playerCount);
    const id = (
      await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'russianrailroads', players: names } })
    ).json().game.id as string;
    const readAs = async (seat: string) =>
      (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${seat}` })).json().game as View;
    const post = async (seat: string, action: Action) => {
      const res = await app.inject({
        method: 'POST',
        url: `/games/${id}/actions?viewer=${seat}`,
        payload: { playerId: seat, action },
      });
      if (res.statusCode !== 200) {
        throw new Error(`illegal action ${JSON.stringify(action)} by ${seat}: ${res.statusCode} ${res.payload}`);
      }
      return res.json().game as View;
    };
    const legalOf = (view: View, seat: string): Action[] =>
      legalActions(view as unknown as RussianRailroadsState, seat);

    const cover: Coverage = {
      trackLock: false,
      colorUnlock: false,
      doubler: false,
      locoChain: false,
      factoryPool: false,
      keyChoice: false,
      ideaToken: false,
      turnClaim: false,
      reuse: false,
      engineerHire: false,
      engineerUse: false,
      passScore: false,
    };

    let focus: string | null = null;
    let lastVersion = -1;
    let view = await readAs('p1');
    let steps = 0;
    for (; steps < 6000 && view.status === 'active'; steps += 1) {
      const seat = view.players[view.activePlayerIndex]!.id;
      view = await readAs(seat);
      if (steps > 0) expect(view.version).toBeGreaterThan(lastVersion);
      lastVersion = view.version;
      const me = seatOf(view, seat);
      const legal = legalOf(view, seat);
      const has = (t: Action['type']) => legal.some((a) => a.type === t);
      // Return the actual legal PLACE for `space` (with `build`) — it already carries the right coins/worker
      // payment (legalActions offers the worker variant when affordable, else the coin-substitute variant), so
      // posting the found action verbatim is always legal.
      const place = (space: string, build?: 'loco' | 'factory'): Action | undefined =>
        legal.find((a) => a.type === 'PLACE' && a.space === space && a.build === build);

      // ── Locks / mini-phases: the seat on the clock may only resolve what is owed ──
      if (view.pendingSetupBonus) {
        view = await post(seat, { type: 'RESOLVE_SETUP_BONUS', card: 'start-coins-2' });
        if (focus === null) focus = view.players[view.activePlayerIndex]!.id; // round-1 opener once setup ends
        continue;
      }
      if (focus === null) focus = seat;
      if (view.pendingReuse) {
        const reuse = legal.find((a) => a.type === 'RESOLVE_REUSE');
        cover.reuse = true;
        view = await post(seat, reuse ?? { type: 'PASS' });
        continue;
      }
      if (view.pendingMoves) {
        const steps2 = legal.filter((a): a is Extract<Action, { type: 'MOVE_TRACK' }> => a.type === 'MOVE_TRACK');
        const nonWood = steps2.find((s) => s.color && s.color !== 'wood');
        let pick = nonWood;
        if (!pick) {
          const ts = steps2.find((s) => s.route === 'transsiberian');
          const ky = steps2.find((s) => s.route === 'kyiv');
          // Push the Trans-Siberian wood to space 2 first (unlocks green); then feed Kyiv toward its end (key).
          if (ts && frontier(me.routes.find((r) => r.id === 'transsiberian')!) < 1) pick = ts;
          else pick = ky ?? steps2[0];
        }
        cover.trackLock = true;
        if (pick!.color && pick!.color !== 'wood') cover.colorUnlock = true;
        view = await post(seat, pick!);
        continue;
      }
      if (view.pendingLoco) {
        const replace = legal.find((a) => a.type === 'REPLACE_LOCO');
        const placeLoco = legal.find((a) => a.type === 'PLACE_LOCO');
        const flip = legal.find((a) => a.type === 'FLIP_LOCO');
        if (replace && !cover.locoChain) {
          cover.locoChain = true; // an upgrade cascades the displaced loco (the pg. 11 chain)
          view = await post(seat, replace);
        } else {
          view = await post(seat, placeLoco ?? flip!);
        }
        continue;
      }
      if (view.pendingFactory) {
        const pf = legal.find((a) => a.type === 'PLACE_FACTORY') ?? legal.find((a) => a.type === 'REPLACE_FACTORY');
        view = await post(seat, pf!);
        continue;
      }
      if (view.pendingKey) {
        cover.keyChoice = true;
        view = await post(seat, { type: 'RESOLVE_KEY', option: 'points' });
        continue;
      }
      if (view.pendingIdeaToken) {
        const tok = legal.find((a) => a.type === 'RESOLVE_IDEA_TOKEN');
        cover.ideaToken = true;
        view = await post(seat, tok ?? { type: 'PASS' });
        continue;
      }
      if (view.pendingIdeaCard) {
        const c = legal.find((a) => a.type === 'RESOLVE_IDEA_CARD');
        view = await post(seat, c ?? { type: 'PASS' });
        continue;
      }
      if (me.actionPool.length > 0) {
        const resolve = legal.find((a) => a.type === 'RESOLVE_POOL');
        if (resolve) {
          cover.factoryPool = true;
          view = await post(seat, resolve);
        } else {
          view = await post(seat, { type: 'SKIP_POOL' });
        }
        continue;
      }

      // ── Placement. Non-focus seats pass; the focus seat pursues uncovered goals. ──
      if (seat !== focus) {
        cover.passScore = true;
        view = await post(seat, { type: 'PASS' });
        continue;
      }

      const useEng = legal.find((a) => a.type === 'USE_ENGINEER');
      const gapsFilled = me.industry.factories.filter((f) => f != null).length;
      const wantFactory = (!cover.ideaToken && gapsFilled < 3) || (!cover.factoryPool && gapsFilled < 1);
      const hireable = view.engineerStrip[view.engineerStrip.length - 1];

      // Focus-seat goal priority. Cheap one-off goals (doubler, turn-order claim → reuse next round, engineer
      // hire/use) come first so they land in an early round; the multi-round industry grind (factoryPool +
      // the industry idea space) and the track-building goals (key, colour unlock) fill the rest.
      let action: Action | undefined;
      if (useEng && !cover.engineerUse) {
        cover.engineerUse = true;
        action = useEng;
      } else if (!cover.engineerHire && has('HIRE_ENGINEER') && hireable && hireable.action.kind !== 'inert') {
        cover.engineerHire = true;
        action = { type: 'HIRE_ENGINEER' };
      } else if (!cover.turnClaim && place('turnorder-2')) {
        cover.turnClaim = true;
        action = place('turnorder-2');
      } else if (!cover.doubler && place('doubler')) {
        cover.doubler = true;
        action = place('doubler');
      } else if (!cover.locoChain && place('loco-1', 'loco')) {
        action = place('loco-1', 'loco');
      } else if (wantFactory && (place('loco-2', 'factory') ?? place('loco-1', 'factory'))) {
        action = place('loco-2', 'factory') ?? place('loco-1', 'factory');
      } else if (
        (!cover.factoryPool || !cover.ideaToken) &&
        (place('industry-2') ?? place('industry-1') ?? place('industry-3') ?? place(LAST_ROUND_INDUSTRY_ID))
      ) {
        action = place('industry-2') ?? place('industry-1') ?? place('industry-3') ?? place(LAST_ROUND_INDUSTRY_ID);
      } else if (!cover.colorUnlock && place('track-green-1')) {
        action = place('track-green-1');
      } else if (!cover.keyChoice && (place('track-wood-2') ?? place('track-wood-1') ?? place('track-bottom'))) {
        action = place('track-wood-2') ?? place('track-wood-1') ?? place('track-bottom');
      } else if (!cover.colorUnlock && (place('track-wood-1') ?? place('track-wood-2') ?? place('track-bottom'))) {
        action = place('track-wood-1') ?? place('track-wood-2') ?? place('track-bottom');
      }

      if (!action) {
        cover.passScore = true;
        action = { type: 'PASS' };
      }
      view = await post(seat, action);
    }

    return { ended: view, cover, steps };
  }

  /** Assert the ended game's breakdown is internally consistent and the winners obey the tie rule (pg. 23). */
  function assertCoherentEnd(ended: View): void {
    expect(ended.status).toBe('ended');
    const results = ended.results!;
    expect(results.map((r) => r.playerId).sort()).toEqual(ended.players.map((p) => p.id).sort());
    for (const r of results) expect(r.total).toBe(r.base + r.endBonus + r.majority);
    const maxTotal = Math.max(...results.map((r) => r.total));
    const expectedWinners = results.filter((r) => r.total === maxTotal).map((r) => r.playerId);
    expect([...ended.winnerIds!].sort()).toEqual([...expectedWinners].sort());
    // The final board's per-player score equals the final total (final scoring folded onto the track).
    for (const r of results) expect(ended.players.find((p) => p.id === r.playerId)!.score).toBe(r.total);
  }

  /** Assert the move log is a gap-free, typed audit trail whose length matches the final version. */
  function assertLogReplaysSanely(ended: View): void {
    expect(ended.log.length).toBe(ended.version); // record() bumps version + appends exactly one entry
    ended.log.forEach((entry, i) => {
      expect(entry.seq).toBe(i + 1);
      expect(KNOWN_TYPES.has(entry.type)).toBe(true);
    });
  }

  // The union of the coverage across the three games must touch every behaviour — asserted so a future
  // change that makes a path unreachable fails loudly.
  const union: Coverage = {
    trackLock: false,
    colorUnlock: false,
    doubler: false,
    locoChain: false,
    factoryPool: false,
    keyChoice: false,
    ideaToken: false,
    turnClaim: false,
    reuse: false,
    engineerHire: false,
    engineerUse: false,
    passScore: false,
  };

  for (const { players, seed } of [
    { players: 2, seed: 101 },
    { players: 3, seed: 202 },
    { players: 4, seed: 303 },
  ]) {
    it(`plays a complete ${players}-player game over REST — coherent end, sane log (seed ${seed})`, async () => {
      const db = createDatabase();
      const app = buildApp({ db, rng: makeRng(seed) });
      await app.ready();
      try {
        const { ended, cover, steps } = await playToEnd(app, players);
        expect(steps).toBeLessThan(6000);
        assertCoherentEnd(ended);
        assertLogReplaysSanely(ended);
        for (const key of Object.keys(union) as (keyof Coverage)[]) union[key] ||= cover[key];
      } finally {
        await app.close();
        db.close();
      }
    }, 60000);
  }

  it('the three games together exercised the whole behavioural surface (coverage assertion)', () => {
    // Run after the three games above; `union` accumulates their coverage.
    expect(union).toEqual({
      trackLock: true,
      colorUnlock: true,
      doubler: true,
      locoChain: true,
      factoryPool: true,
      keyChoice: true,
      ideaToken: true,
      turnClaim: true,
      reuse: true,
      engineerHire: true,
      engineerUse: true,
      passScore: true,
    });
  });
});
