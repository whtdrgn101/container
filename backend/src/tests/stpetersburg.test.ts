import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GameError } from '@game-hub/engine/stpetersburg';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { mapStPetersburgError } from '../games/stpetersburg/errors';

type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;

/** Pull-based reader over an injected WebSocket: `next()` resolves with the next JSON message. */
function reader(socket: WsClient): () => Promise<{ type: string; game: PlayerViewShape }> {
  type Msg = { type: string; game: PlayerViewShape };
  const queue: Msg[] = [];
  const pending: Array<(m: Msg) => void> = [];
  socket.on('message', (raw: unknown) => {
    const msg = JSON.parse(String(raw)) as Msg;
    const resolve = pending.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  });
  return () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise<Msg>((r) => pending.push(r)));
}

interface PlayerViewShape {
  readonly players: readonly { readonly id: string; readonly rubles: number | null; readonly hand: unknown; readonly handCount: number }[];
  readonly board: { readonly stacks: Record<string, number> };
  readonly round: number;
  readonly phase: string;
}

/** A richer projection shape for the SP1 play-through: play areas, the upper row, and the turn cursor. */
interface PlayerViewShapeFull {
  readonly players: readonly {
    readonly id: string;
    readonly rubles: number | null;
    readonly playArea: { readonly worker: readonly unknown[] };
  }[];
  readonly board: {
    readonly upper: readonly unknown[];
    readonly lower: readonly { readonly kind: string }[];
    readonly discard: number;
    readonly stacks: Record<string, number>;
  };
  readonly round: number;
  readonly phase: string;
  readonly startingPlayers: Record<string, number>;
  readonly activePlayerIndex: number;
}

/**
 * Saint Petersburg bootstrap (roadmap SP0) over REST + WS — the platform proof that a **fourth** game
 * registers and renders, coexisting with Container, Can't Stop and Stone Age. It has no playable actions
 * yet (each lands in its own slice), so `/actions` is refused; the interest is that redaction (opponents'
 * rubles + hands, and the draw-stack contents) holds on every response path from day one.
 */
describe('Saint Petersburg bootstrap', () => {
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
    app.inject({ method: 'POST', url: '/games', payload: { gameType: 'stpetersburg', players } });

  it('is listed in the catalog with its palette, alongside the other three games', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
    }[];
    expect(catalog.map((g) => g.id)).toEqual(['container', 'cantstop', 'stoneage', 'stpetersburg']);
    const sp = catalog.find((g) => g.id === 'stpetersburg')!;
    expect(sp.colors).toEqual(['blue', 'yellow', 'green', 'red']);
    expect([sp.minPlayers, sp.maxPlayers]).toEqual([2, 4]);
  });

  it('deals a fresh game with the Saint Petersburg setup (25 rubles, worker phase, seeded row)', async () => {
    const res = await create([{ name: 'Ann' }, { name: 'Bob' }]);
    expect(res.statusCode).toBe(201);
    expect(res.json().gameType).toBe('stpetersburg');
    const game = res.json().game;
    expect(game.round).toBe(1);
    expect(game.phase).toBe('worker');
    // 2-player game → 4 workers seeded into the upper row (pg. 8).
    expect(game.board.upper).toHaveLength(4);
    expect(game.board.upper.every((c: { kind: string }) => c.kind === 'worker')).toBe(true);
    // The create response is projected for the active seat: it sees its own rubles, not the opponent's.
    const active = game.players[game.activePlayerIndex];
    expect(active.rubles).toBe(25);
  });

  it('coexists — a Saint Petersburg game and a Stone Age game are told apart on read', async () => {
    const sp = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game as { id: string };
    const sa = (
      await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'stoneage', players: [{ name: 'Cy' }, { name: 'Di' }] } })
    ).json().game as { id: string };

    const spRead = await app.inject({ method: 'GET', url: `/games/${sp.id}` });
    expect(spRead.json().gameType).toBe('stpetersburg');
    expect(spRead.json().game.board.stacks).toBeDefined(); // SP shape
    expect(spRead.json().game.placements).toBeUndefined(); // not Stone Age

    const saRead = await app.inject({ method: 'GET', url: `/games/${sa.id}` });
    expect(saRead.json().gameType).toBe('stoneage');
    expect(saRead.json().game.board).toBeUndefined();
  });

  it('rejects a malformed action with a 400 (parseAction)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'FLY' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/unknown action type/);
  });

  it('plays a full worker phase over REST — buys, passes, scoring and refill (SP1)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;

    // Act as whichever seat is on the clock, projected for that seat so its own rubles are visible.
    const act = async (playerId: string, action: unknown) =>
      (
        await app.inject({
          method: 'POST',
          url: `/games/${id}/actions?viewer=${playerId}`,
          payload: { playerId, action },
        })
      ).json();
    const read = async (viewer: string) => (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${viewer}` })).json().game as PlayerViewShapeFull;
    const activeId = (game: PlayerViewShapeFull) => game.players[game.activePlayerIndex]!.id;

    // Both seats buy a worker from the upper row.
    const cost: Record<string, number> = {};
    let game = await read('p1');
    for (let i = 0; i < 2; i += 1) {
      const seat = activeId(game);
      const res = await act(seat, { type: 'BUY', row: 'upper', index: 0 });
      game = res.game as PlayerViewShapeFull;
      cost[seat] = res.game.log.at(-1).payload.cost as number;
      const buyer = game.players.find((p) => p.id === seat)!;
      expect(buyer.playArea.worker).toHaveLength(1);
      expect(buyer.rubles).toBe(25 - cost[seat]!); // bound viewer sees its own rubles even off-turn
    }
    expect(game.board.upper).toHaveLength(2); // 4 seeded − 2 bought (rows compact)

    // Both seats pass → the worker phase's actions end, scoring + refill run.
    for (let i = 0; i < 2; i += 1) {
      const seat = activeId(game);
      game = (await act(seat, { type: 'PASS' })).game as PlayerViewShapeFull;
    }

    // Advanced to the building phase; the upper row refilled to 8 from the building stack.
    expect(game.phase).toBe('building');
    expect(game.board.upper).toHaveLength(8);
    expect(game.board.stacks.building).toBeLessThan(28);

    // Worker scoring paid each seat +3 rubles — visible in each seat's own view, and still redacted
    // for the opponent even though scoring changed their (hidden) purse.
    for (const seat of ['p1', 'p2']) {
      const view = await read(seat);
      const me = view.players.find((p) => p.id === seat)!;
      expect(me.rubles).toBe(25 - cost[seat]! + 3);
      const opp = view.players.find((p) => p.id !== seat)!;
      expect(opp.rubles).toBeNull(); // redaction holds through scoring
    }
  });

  it('plays a full round into round 2 over REST — the round transition (slide, discard, markers) (SP2)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;

    let game!: PlayerViewShapeFull;
    const activeId = (g: PlayerViewShapeFull) => g.players[g.activePlayerIndex]!.id;
    const step = async (action: unknown) => {
      const seat = activeId(game);
      game = (await app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${seat}`, payload: { playerId: seat, action } })).json().game;
    };

    game = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=p1` })).json().game;
    const round1Markers = game.startingPlayers;

    // Round 1: the active seat buys one worker (a card is taken → refills run), then everyone passes the
    // rest of the round out (no further buys) — worker, building, aristocrat, and the no-scoring trading
    // phase, whose close rolls the round over.
    await step({ type: 'BUY', row: 'upper', index: 0 });
    while (game.round === 1) await step({ type: 'PASS' });

    // Entering round 2: the round-1 upper row (8 after the worker refill) slid down to the lower row, the
    // (empty) round-1 lower row discarded nothing, and every marker moved one seat left.
    expect(game.round).toBe(2);
    expect(game.phase).toBe('worker');
    expect(game.board.upper).toHaveLength(0);
    expect(game.board.lower).toHaveLength(8);
    expect(game.board.discard).toBe(0);
    const n = game.players.length;
    for (const phase of ['worker', 'building', 'aristocrat', 'trading']) {
      expect(game.startingPlayers[phase]).toBe((round1Markers[phase]! + 1) % n);
    }
    expect(game.activePlayerIndex).toBe(game.startingPlayers.worker);

    // Round 2: buy a worker from the lower row (a card is taken again), then pass the round out. At the
    // next transition the lower row (7 leftover workers) is discarded — the discard count grows over the wire.
    await step({ type: 'BUY', row: 'lower', index: 0 });
    while (game.round === 2) await step({ type: 'PASS' });
    expect(game.round).toBe(3);
    expect(game.board.discard).toBe(7);

    // Redaction still holds after the round transitions: each seat sees its own rubles, the opponent's null.
    for (const seat of ['p1', 'p2']) {
      const view = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${seat}` })).json().game as PlayerViewShapeFull;
      expect(view.players.find((p) => p.id === seat)!.rubles).not.toBeNull();
      expect(view.players.find((p) => p.id !== seat)!.rubles).toBeNull();
    }
  });

  it('creates via a lobby and enforces the 2–4 seat range', async () => {
    const tooMany = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 5, gameType: 'stpetersburg' } });
    expect(tooMany.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 4, gameType: 'stpetersburg' } });
    expect(ok.statusCode).toBe(201);
  });

  it('redacts opponents’ rubles + hands and stack contents over REST', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cy' }])).json().game.id as string;

    // Fetched as p1: p1 sees its own rubles; opponents show null rubles and null hands (count only).
    const view = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=p1` })).json().game as PlayerViewShape;
    expect(view.players[0]!.rubles).toBe(25);
    expect(view.players[1]!.rubles).toBeNull();
    expect(view.players[1]!.hand).toBeNull();
    expect(view.players[1]!.handCount).toBe(0);
    // The draw stacks are counts, never contents.
    expect(view.board.stacks).toMatchObject({ worker: 25, building: 28, aristocrat: 27, trading: 30 });

    // A spectator sees no rubles at all.
    const spec = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=nobody` })).json().game as PlayerViewShape;
    expect(spec.players.every((p) => p.rubles === null)).toBe(true);
  });

  it('redacts opponents over the WebSocket stream for a bound viewer', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const socket = await app.injectWS(`/games/${id}/stream?viewer=p2`);
    const next = reader(socket);

    const initial = await next();
    expect(initial.type).toBe('state');
    // p2 is bound: it sees its own rubles, never p1's, regardless of whose turn it is.
    expect(initial.game.players[1]!.rubles).toBe(25);
    expect(initial.game.players[0]!.rubles).toBeNull();
    expect(initial.game.players[0]!.hand).toBeNull();

    socket.close();
  });
});

describe('mapStPetersburgError', () => {
  it('maps the engine’s domain codes to HTTP (and passes non-domain errors through)', () => {
    expect(mapStPetersburgError(new GameError('PLAYER_NOT_FOUND', 'x'))?.status).toBe(404);
    expect(mapStPetersburgError(new GameError('INVALID_PLAYER_COUNT', 'x'))?.status).toBe(400);
    expect(mapStPetersburgError(new GameError('NOT_YOUR_TURN', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('INSUFFICIENT_RUBLES', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('INVALID_CARD_SLOT', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('TRADING_NOT_BUYABLE', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new Error('not ours'))).toBeNull();
  });
});
