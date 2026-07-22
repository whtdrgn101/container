import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGame, GameError, legalActions } from '@game-hub/engine/stpetersburg';
import type { Action, Card, StPetersburgResult, StPetersburgState } from '@game-hub/engine/stpetersburg';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { stPetersburgModule } from '../games';
import { mapStPetersburgError } from '../games/stpetersburg/errors';
import { GameRepository } from '../repository';

type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;

/** A small deterministic PRNG (mulberry32) so a seeded game's whole deck order is reproducible. */
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

/** The active-seat's own view shape the SP4 displacement driver reads (its own rubles + play areas). */
interface DriveView {
  readonly players: readonly {
    readonly id: string;
    readonly rubles: number | null;
    readonly playArea: { readonly worker: readonly Card[]; readonly building: readonly Card[]; readonly aristocrat: readonly Card[] };
  }[];
  readonly board: { readonly discard: number };
  readonly activePlayerIndex: number;
  readonly log: readonly unknown[];
}

/** Every face-up card in a seat's play area (all three groups), for the displacement assertions. */
function playAreaCards(g: DriveView, seat: string): readonly Card[] {
  const p = g.players.find((pl) => pl.id === seat)!;
  return [...p.playArea.worker, ...p.playArea.building, ...p.playArea.aristocrat];
}

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
 * Saint Petersburg over REST + WS — the platform proof that a **fourth** game registers and plays,
 * coexisting with Container, Can't Stop and Stone Age. The phase spine (BUY/PASS), the hidden hand
 * (ADD_TO_HAND/PLAY_FROM_HAND) and the trading-card displacement (SP4) all flow through `/actions`; the
 * standing interest is that redaction (opponents' rubles + hands, and the draw-stack contents) holds on
 * every response path from day one.
 */
describe('Saint Petersburg', () => {
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

  // The backend deals with the app's real rng (Math.random by default), so which seat opens the worker
  // phase and the card costs vary run to run — these tests act as whichever seat is on the clock.
  type HandView = {
    phase: string;
    activePlayerIndex: number;
    players: { id: string; rubles: number | null; playArea: { worker: unknown[] }; hand: { id: string; cost: number }[] | null; handCount: number }[];
    board: { upper: unknown[] };
  };

  it('adds a card to hand over REST — the row slot empties; opponents see the count, owner the contents (SP3)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const read = async (viewer: string) => (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${viewer}` })).json().game as HandView;

    // The active seat adds an upper-row card to its hand — free.
    const start = await read('p1');
    const owner = start.players[start.activePlayerIndex]!.id;
    const opp = start.players.find((p) => p.id !== owner)!.id;
    const res = await app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${owner}`, payload: { playerId: owner, action: { type: 'ADD_TO_HAND', row: 'upper', index: 0 } } });
    expect(res.statusCode).toBe(200);

    // Owner's own view: contents visible, rubles unchanged (add is free), the row slot emptied.
    const own = await read(owner);
    const ownerView = own.players.find((p) => p.id === owner)!;
    expect(ownerView.hand).toHaveLength(1);
    expect(ownerView.handCount).toBe(1);
    expect(ownerView.rubles).toBe(25); // free
    expect(own.board.upper).toHaveLength(3); // 4 seeded − 1 taken (rows compact)
    const takenId = ownerView.hand![0]!.id;

    // Opponent's view: the owner's hand is a COUNT only — contents null, and the taken card's instance id
    // is nowhere on the opponent's wire (it left the shared row and the hand is redacted).
    const oppRaw = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${opp}` })).json();
    const oppOwner = (oppRaw.game.players as { id: string; hand: unknown; handCount: number }[]).find((p) => p.id === owner)!;
    expect(oppOwner.hand).toBeNull();
    expect(oppOwner.handCount).toBe(1);
    expect(JSON.stringify(oppRaw.game)).not.toContain(takenId);
    // The take itself is public: the feed NAMES the taken card (everyone at the table sees which card you take).
    expect(oppRaw.game.log.at(-1).payload.cardName).toBeTruthy();
  });

  it('plays a card from hand in a later phase over REST — the cost is charged (SP3)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const act = async (playerId: string, action: unknown) =>
      (await app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${playerId}`, payload: { playerId, action } })).json();
    const read = async (viewer: string) => (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${viewer}` })).json().game as HandView;
    const activeId = (g: HandView) => g.players[g.activePlayerIndex]!.id;

    // The active seat (the "holder") adds a worker to hand in the worker phase.
    let game = await read('p1');
    const holder = activeId(game);
    await act(holder, { type: 'ADD_TO_HAND', row: 'upper', index: 0 });
    // The held card's printed cost — the holder owns no matching card, so hand-play cost equals it.
    const heldCost = (await read(holder)).players.find((p) => p.id === holder)!.hand![0]!.cost;

    // Everyone passes until the worker phase closes → the building phase (a genuinely later phase).
    game = await read(holder);
    while (game.phase === 'worker') {
      await act(activeId(game), { type: 'PASS' });
      game = await read(holder);
    }
    expect(game.phase).toBe('building');
    // Get the holder back on the clock (2-player: one pass flips the active seat).
    if (activeId(game) !== holder) {
      await act(activeId(game), { type: 'PASS' });
      game = await read(holder);
    }
    expect(activeId(game)).toBe(holder);

    // The holder plays the held worker in the building phase — charged exactly its cost (it scored nothing
    // at worker-close: it was in hand, not the play area).
    const played = (await act(holder, { type: 'PLAY_FROM_HAND', index: 0 })).game as HandView;
    const me = played.players.find((p) => p.id === holder)!;
    expect(me.playArea.worker).toHaveLength(1); // now face-up in the play area
    expect(me.handCount).toBe(0); // left the hand
    expect(me.rubles).toBe(25 - heldCost); // 25 − the card's cost
  });

  it('refuses an add over the hand limit with 409 HAND_FULL (SP3)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const act = async (playerId: string, action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${playerId}`, payload: { playerId, action } });
    const read = async () => (await app.inject({ method: 'GET', url: `/games/${id}?viewer=p1` })).json().game as HandView;
    const add = { type: 'ADD_TO_HAND', row: 'upper', index: 0 } as const;

    // The holder fills its hand to the limit of 3, handing the turn back through the other seat each time.
    const start = await read();
    const holder = start.players[start.activePlayerIndex]!.id;
    const opp = start.players.find((p) => p.id !== holder)!.id;
    for (let i = 0; i < 3; i += 1) {
      expect((await act(holder, add)).statusCode).toBe(200);
      await act(opp, { type: 'PASS' }); // return the turn to the holder without closing the phase
    }
    // A 4th add is refused — the hand is full.
    const overflow = await act(holder, add);
    expect(overflow.statusCode).toBe(409);
    expect(overflow.json().error.code).toBe('HAND_FULL');
  });

  it('rejects a displacement target on a non-trading card with 409 DISPLACE_NOT_ALLOWED (SP4)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    // The opening upper row is all workers (non-trading); a displacement target on one is refused.
    const start = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=p1` })).json().game as HandView;
    const seat = start.players[start.activePlayerIndex]!.id;
    const res = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions?viewer=${seat}`,
      payload: { playerId: seat, action: { type: 'BUY', row: 'upper', index: 0, displace: 'anything' } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('DISPLACE_NOT_ALLOWED');
  });

  it('validates the displace field shape (parseAction — must be a string when present)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions?viewer=p1`,
      payload: { playerId: 'p1', action: { type: 'BUY', row: 'upper', index: 0, displace: 42 } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/displace/);
  });

  it('buys a trading card by displacement over REST — the play area swaps, the discard grows, the difference is charged (SP4)', async () => {
    // A seeded rng makes the whole deck deterministic, so this greedy driver reproducibly reaches a
    // trading-card displacement. It reads each active seat's own view and computes `legalActions` on it
    // (the same cast the UI uses — move enumeration never touches another seat's secrets).
    const seededDb = createDatabase();
    const app2 = buildApp({ db: seededDb, rng: makeRng(20260722) });
    await app2.ready();
    try {
      const id = (
        await app2.inject({ method: 'POST', url: '/games', payload: { gameType: 'stpetersburg', players: [{ name: 'Ann' }, { name: 'Bob' }] } })
      ).json().game.id as string;

      const readAs = async (viewer: string) =>
        (await app2.inject({ method: 'GET', url: `/games/${id}?viewer=${viewer}` })).json().game as DriveView;
      const post = async (seat: string, action: Action) =>
        (await app2.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${seat}`, payload: { playerId: seat, action } })).json().game as DriveView;
      const activeId = (g: DriveView) => g.players[g.activePlayerIndex]!.id;
      const isTradeBuy = (a: Action): a is Extract<Action, { type: 'BUY' }> => a.type === 'BUY' && a.displace !== undefined;

      let cursor = await readAs('p1');
      let done: { seat: string; before: DriveView; action: Extract<Action, { type: 'BUY' }> } | undefined;
      for (let step = 0; step < 400 && !done; step += 1) {
        const seat = activeId(cursor);
        const view = await readAs(seat); // active seat sees its own rubles + hand
        const actions = legalActions(view as unknown as StPetersburgState, seat);
        const trade = actions.find(isTradeBuy);
        if (trade) {
          done = { seat, before: view, action: trade };
          break;
        }
        // Otherwise accumulate a stock of cards (so blue/orange trading cards have something to displace),
        // buying the first affordable card; else take any legal move to advance (a PASS normally, but an
        // SP5 Pub/Observatory interlude locks the turn, so fall back to whatever `legalActions` allows).
        const buy = actions.find((a) => a.type === 'BUY');
        const fallback = actions.find((a) => a.type === 'PASS') ?? actions[0]!;
        cursor = await post(seat, buy ?? fallback);
      }

      expect(done).toBeDefined();
      const { seat, before, action } = done!;
      const target = [...playAreaCards(before, seat)].find((c) => c.id === action.displace)!;
      expect(target).toBeDefined(); // the card we're about to displace, in the buyer's play area

      const after = await post(seat, action);
      const log = after.log.at(-1) as { type: string; payload: { cost: number; cardKey: string; displacedName?: string } };
      expect(log.type).toBe('BUY');
      expect(log.payload.displacedName).toBeTruthy(); // the feed names the displaced card
      // The displaced card is gone from the play area; the discard grew by exactly one.
      expect([...playAreaCards(after, seat)].some((c) => c.id === action.displace)).toBe(false);
      expect(after.board.discard).toBe(before.board.discard + 1);
      // The difference was charged: rubles fell by exactly the logged cost.
      const rublesBefore = before.players.find((p) => p.id === seat)!.rubles!;
      expect(after.players.find((p) => p.id === seat)!.rubles).toBe(rublesBefore - log.payload.cost);
    } finally {
      await app2.close();
      seededDb.close();
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

  // ── SP5 special cards (pg. 8) ──

  it('accepts the SP5 client actions and cleanly refuses them out of context (parseAction + engine locks)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const start = (await app.inject({ method: 'GET', url: `/games/${id}?viewer=p1` })).json().game as PlayerViewShapeFull;
    const seat = start.players[start.activePlayerIndex]!.id;
    const post = (action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${seat}`, payload: { playerId: seat, action } });

    // Parsed, routed, refused by the engine (no window open / not owned) → 409 with the engine's code.
    const pub = await post({ type: 'PUB_BUY', points: 2 });
    expect(pub.statusCode).toBe(409);
    expect(pub.json().error.code).toBe('NO_PUB_PENDING');

    const resolve = await post({ type: 'OBSERVATORY_RESOLVE', choice: 'discard' });
    expect(resolve.statusCode).toBe(409);
    expect(resolve.json().error.code).toBe('NO_DRAW_PENDING');

    // The opening phase is the worker phase and no Observatory is owned → OBSERVATORY_UNAVAILABLE.
    const draw = await post({ type: 'OBSERVATORY_DRAW', stack: 'building' });
    expect(draw.statusCode).toBe(409);
    expect(draw.json().error.code).toBe('OBSERVATORY_UNAVAILABLE');
  });

  it('validates the SP5 action shapes (parseAction — 400 on bad points/stack/choice)', async () => {
    const id = (await create([{ name: 'Ann' }, { name: 'Bob' }])).json().game.id as string;
    const post = (action: unknown) =>
      app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=p1`, payload: { playerId: 'p1', action } });

    expect((await post({ type: 'PUB_BUY', points: -1 })).statusCode).toBe(400);
    expect((await post({ type: 'PUB_BUY', points: 1.5 })).statusCode).toBe(400);
    expect((await post({ type: 'OBSERVATORY_DRAW', stack: 'gold' })).statusCode).toBe(400);
    expect((await post({ type: 'OBSERVATORY_RESOLVE', choice: 'sell' })).statusCode).toBe(400);
    expect((await post({ type: 'OBSERVATORY_RESOLVE', choice: 'buy', displace: 42 })).statusCode).toBe(400);
  });

  it('drives a seeded game through the specials: a Pub buy, an Observatory draw+resolve (pendingDraw revealed), and a 4-card Warehouse hand', async () => {
    // A seeded deck is deterministic, so a greedy driver that snaps up the special buildings reproducibly
    // reaches all three windows. It reads each active seat's own view (its rubles/hand visible) and plays.
    const seededDb = createDatabase();
    const app2 = buildApp({ db: seededDb, rng: makeRng(7) });
    await app2.ready();
    try {
      const id = (
        await app2.inject({ method: 'POST', url: '/games', payload: { gameType: 'stpetersburg', players: [{ name: 'Ann' }, { name: 'Bob' }] } })
      ).json().game.id as string;

      type SpecCard = { id: string; kind: string; special?: string };
      type SpecView = {
        phase: string;
        activePlayerIndex: number;
        board: { upper: SpecCard[]; lower: SpecCard[]; stacks: Record<string, number>; discard: number };
        observatoryUsed: string[];
        pendingPubBuy?: { queue: number[] };
        pendingDraw?: { seat: number; stack: string; card: SpecCard; observatoryId: string };
        players: { id: string; rubles: number | null; points: number; hand: SpecCard[] | null; handCount: number; playArea: { worker: SpecCard[]; building: SpecCard[]; aristocrat: SpecCard[] } }[];
      };
      const readAs = async (viewer: string) => (await app2.inject({ method: 'GET', url: `/games/${id}?viewer=${viewer}` })).json().game as SpecView;
      const post = async (seat: string, action: unknown) =>
        app2.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${seat}`, payload: { playerId: seat, action } });
      const activeId = (g: SpecView) => g.players[g.activePlayerIndex]!.id;
      const owns = (g: SpecView, seat: string, special: string) =>
        g.players.find((p) => p.id === seat)!.playArea.building.some((c) => c.special === special);

      let pubBought = false;
      let observatoryResolved = false;
      let pendingDrawWasRevealed = false;
      let warehouseChecked = false;

      // ONE greedy loop reaches all three windows (the special buildings are cheap, so the driver snaps
      // them up as they surface from the shuffled building stack). No end trigger yet (SP6), so the game
      // simply refills round on round; the step cap bounds it. `makeRng(7)` is verified to hit all targets.
      for (let step = 0; step < 2500 && !(pubBought && observatoryResolved && warehouseChecked); step += 1) {
        const cursor = await readAs('p1');
        const seat = activeId(cursor);
        const view = await readAs(seat);
        const me = view.players.find((p) => p.id === seat)!;

        // A Pub window is open for me → buy the max affordable, assert points rose (and rubles fell 2×).
        if (view.pendingPubBuy && view.pendingPubBuy.queue[0] === view.activePlayerIndex) {
          const afford = Math.min(5, Math.floor((me.rubles ?? 0) / 2));
          const res = await post(seat, { type: 'PUB_BUY', points: afford });
          expect(res.statusCode).toBe(200);
          if (afford > 0 && !pubBought) {
            const after = (res.json().game as SpecView).players.find((p) => p.id === seat)!;
            expect(after.points).toBe(me.points + afford);
            expect(after.rubles).toBe((me.rubles ?? 0) - afford * 2);
            pubBought = true;
          }
          continue;
        }

        // A draw is pending for me → assert it's REVEALED to the opponent (the ruling), then discard it.
        if (view.pendingDraw && view.pendingDraw.seat === view.activePlayerIndex) {
          const opp = view.players.find((p) => p.id !== seat)!.id;
          const oppView = await readAs(opp);
          expect(oppView.pendingDraw?.card.id).toBe(view.pendingDraw.card.id); // public — not redacted
          await post(seat, { type: 'OBSERVATORY_RESOLVE', choice: 'discard' });
          observatoryResolved = true;
          pendingDrawWasRevealed = true;
          continue;
        }

        // Building phase, I own an unflipped Observatory → use it (draw the top of a ≥2-card stack).
        if (view.phase === 'building' && !observatoryResolved) {
          const obs = me.playArea.building.find((c) => c.special === 'observatory' && !view.observatoryUsed.includes(c.id));
          const stack = (['worker', 'building', 'aristocrat', 'trading'] as const).find((k) => view.board.stacks[k]! >= 2);
          if (obs && stack) {
            await post(seat, { type: 'OBSERVATORY_DRAW', stack });
            continue;
          }
        }

        // Warehouse (pg. 8): once I own one and a phase has ≥5 board cards, hold a 4th card in hand — proof
        // the limit rose above 3 (a non-owner's HAND_FULL at 3 is the SP3 test). Hand the turn back via an
        // opponent pass between adds.
        if (!warehouseChecked && owns(view, seat, 'warehouse') && view.board.upper.length + view.board.lower.length >= 5) {
          const opp = view.players.find((p) => p.id !== seat)!.id;
          let handCount = me.handCount;
          let guard = 0;
          while (handCount < 4 && guard < 12) {
            const g = await readAs(seat);
            if (activeId(g) !== seat) { await post(opp, { type: 'PASS' }); guard += 1; continue; }
            const row = g.board.upper.length > 0 ? 'upper' : 'lower';
            const res = await post(seat, { type: 'ADD_TO_HAND', row, index: 0 });
            if (res.statusCode !== 200) break;
            handCount = (res.json().game as SpecView).players.find((p) => p.id === seat)!.handCount;
            guard += 1;
          }
          if (handCount === 4) warehouseChecked = true; // the 4th card is held (impossible at limit 3)
          continue;
        }

        // Otherwise: grab a special building we don't yet own (cheap: pub/warehouse/observatory/potemkin),
        // else buy the cheapest affordable card, else pass to move the phase along and accrue income.
        const rows = [...view.board.upper.map((c, i) => ({ c, row: 'upper' as const, i })), ...view.board.lower.map((c, i) => ({ c, row: 'lower' as const, i }))];
        const special = rows.find(({ c }) => c.kind === 'building' && c.special && !owns(view, seat, c.special));
        const target = special ?? rows.find(({ c }) => c.kind !== 'trading');
        if (target && (await post(seat, { type: 'BUY', row: target.row, index: target.i })).statusCode === 200) continue;
        await post(seat, { type: 'PASS' });
      }

      expect(pubBought).toBe(true);
      expect(observatoryResolved).toBe(true);
      expect(pendingDrawWasRevealed).toBe(true);
      expect(warehouseChecked).toBe(true);
    } finally {
      await app2.close();
      seededDb.close();
    }
  });

  // ── SP6 game end + final scoring (pg. 5–6) ──

  /** A throwaway aristocrat card instance (only its identity `key` matters for final scoring). */
  const aristocrat = (key: string, id = `${key}-1`): Card => ({ id, key, kind: 'aristocrat', name: key, cost: 4, income: 0, points: 0 });

  it('ends the game into final scoring at the final round’s trading close — exact breakdown + winners (SP6)', async () => {
    // Seed a near-end state through the repository seam (the persistedCompat.test.ts pattern) — deterministic
    // and fast, no thousand-step drive. Trading has NO scoring (pg. 5), so the seeded rubles/points ARE the
    // final ones, giving an exact breakdown to assert.
    const base = createGame({ id: 'sp-end', players: [{ name: 'Ann' }, { name: 'Bob' }] });
    const seeded: StPetersburgState = {
      ...base,
      phase: 'trading',
      finalRound: true,
      consecutivePasses: 1, // 2 players → one more consecutive pass closes trading → the game ends
      activePlayerIndex: 0,
      players: [
        { id: 'p1', name: 'Ann', rubles: 25, points: 40, playArea: { worker: [], building: [], aristocrat: [aristocrat('scribe', 'p1-a1'), aristocrat('clerk', 'p1-a2')] }, hand: [] },
        { id: 'p2', name: 'Bob', rubles: 5, points: 10, playArea: { worker: [], building: [], aristocrat: [] }, hand: [aristocrat('judge', 'p2-h1')] },
      ],
    };
    new GameRepository(db).create(stPetersburgModule, seeded);

    // Before the close: an opponent's rubles + hand are redacted for p1.
    const before = (await app.inject({ method: 'GET', url: '/games/sp-end?viewer=p1' })).json().game as { status: string; players: { rubles: number | null; hand: unknown }[] };
    expect(before.status).toBe('active');
    expect(before.players[1]!.rubles).toBeNull();
    expect(before.players[1]!.hand).toBeNull();

    // The closing PASS ends the game.
    const res = await app.inject({ method: 'POST', url: '/games/sp-end/actions?viewer=p1', payload: { playerId: 'p1', action: { type: 'PASS' } } });
    expect(res.statusCode).toBe(200);
    const ended = res.json().game as { status: string; round: number; results: StPetersburgResult[]; winnerIds: string[]; players: { id: string; rubles: number | null; hand: unknown[] | null }[] };

    expect(ended.status).toBe('ended');
    expect(ended.round).toBe(base.round); // did NOT roll into a new round
    // p1: 40 base + 3 (2 distinct aristocrats) + 2 (25₽ → 2 pts) − 0 = 45. p2: 10 + 0 + 0 − 5 (1 hand card) = 5.
    expect(ended.results).toEqual([
      { playerId: 'p1', base: 40, aristocrats: 3, distinctAristocrats: 2, money: 2, handPenalty: 0, total: 45 },
      { playerId: 'p2', base: 10, aristocrats: 0, distinctAristocrats: 0, money: 0, handPenalty: 5, total: 5 },
    ]);
    expect(ended.winnerIds).toEqual(['p1']);

    // Redaction LIFTS at ended — the reply (projected for p1) now reveals p2's rubles + hand (pg. 5).
    expect(ended.players[1]!.rubles).toBe(5);
    expect(ended.players[1]!.hand).toHaveLength(1);

    // And a subsequent read, even as a spectator, is fully revealed.
    const spec = (await app.inject({ method: 'GET', url: '/games/sp-end?viewer=nobody' })).json().game as { players: { rubles: number | null }[] };
    expect(spec.players.every((p) => p.rubles !== null)).toBe(true);

    // Ended games drop out of the in-progress resume list (summarize.status = 'ended', filtered in listActive).
    const active = (await app.inject({ method: 'GET', url: '/games' })).json().games as { id: string }[];
    expect(active.some((g) => g.id === 'sp-end')).toBe(false);
  });

  it('the trigger→final-round→ended sequence: a refill placing a group’s last card arms finalRound (SP6)', async () => {
    // Seed the aristocrat phase one pass from close, arranged so its close refills the (next) trading stack
    // to empty — placing the trading group's LAST card on the board. That arms `finalRound`; the round then
    // plays out (trading phase), and the trading close ends the game. Proves the trigger fires from a real
    // board deal, not just a hand-set flag.
    const base = createGame({ id: 'sp-seq', players: [{ name: 'Ann' }, { name: 'Bob' }] });
    const seeded: StPetersburgState = {
      ...base,
      phase: 'aristocrat',
      finalRound: false,
      tookCardThisPhase: true, // a card was taken this phase → the phase-close refill runs (pg. 8 gate open)
      consecutivePasses: 1,
      activePlayerIndex: 0,
      board: {
        // 7 cards on the board → the aristocrat close needs 1 more; the trading stack holds exactly 1, so the
        // deal empties it (places the last trading card).
        upper: base.board.stacks.worker.slice(0, 7),
        lower: [],
        stacks: { worker: base.board.stacks.worker.slice(7), building: [], aristocrat: [], trading: base.board.stacks.trading.slice(0, 1) },
        discard: 0,
      },
    };
    new GameRepository(db).create(stPetersburgModule, seeded);

    type SeqView = { status: string; phase: string; finalRound: boolean; round: number; activePlayerIndex: number; players: { id: string }[] };
    const read = async () => (await app.inject({ method: 'GET', url: '/games/sp-seq?viewer=p1' })).json().game as SeqView;
    const passActive = async (g: SeqView) => {
      const seat = g.players[g.activePlayerIndex]!.id;
      return (await app.inject({ method: 'POST', url: `/games/sp-seq/actions?viewer=${seat}`, payload: { playerId: seat, action: { type: 'PASS' } } })).json().game as SeqView;
    };

    // The aristocrat close arms finalRound (its refill emptied the trading stack) and opens the trading phase.
    let g = await passActive(await read());
    expect(g.phase).toBe('trading');
    expect(g.finalRound).toBe(true);
    expect(g.status).toBe('active'); // "play continues through all phases of this round" (pg. 5)

    // Play the final round's trading phase out → the game ends.
    let guard = 0;
    while (g.status === 'active' && guard < 10) {
      g = await passActive(g);
      guard += 1;
    }
    expect(g.status).toBe('ended');
    expect(g.round).toBe(base.round); // ended in the same (final) round it was armed
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

/**
 * SP7 — **full seeded games over REST**, at 2, 3 and 4 players, driven to a real end. This is the
 * playable-game hardening proof: a single deterministic driver plays each game move-by-move over HTTP
 * (create → read the active seat's own view → POST an action → repeat) and reproducibly exercises the
 * *whole* action surface across the run:
 *
 *   - **buys from both rows** (upper + lower), **add-to-hand then play-from-hand**, at least one
 *     **trading-card displacement**, and the two SP5 interludes — a paying **Pub buy** and an
 *     **Observatory draw + resolve** (each reachable on the seeds picked below).
 *
 * Each game asserts it (a) **ends** into final scoring, (b) has a **coherent breakdown** — every
 * result's `total` equals `base + aristocrats + money − handPenalty`, and `winnerIds` obeys the tie
 * rule (highest total; ties broken on rubles; still-tied ⇒ shared, pg. 6) — (c) **version strictly
 * increases** by exactly one per applied action, and (d) the **move log replays sanely** (contiguous
 * `seq` 1..N, one entry per version, every entry a known action type).
 *
 * Seeds (mulberry32) are chosen so a single game per player count reaches all of the above — verified by
 * a coverage probe; the driver asserts that coverage so a future deck/rule change that stops reaching a
 * path fails loudly rather than silently thinning the test:
 *   - **2p / seed 777**, **3p / seed 7**, **4p / seed 20260722** — each covers all seven paths.
 */
describe('Saint Petersburg — full seeded games to a real end (SP7)', () => {
  /** Every action type Saint Petersburg logs — used to prove no log entry is an unknown move. */
  const KNOWN_TYPES = new Set(['BUY', 'ADD_TO_HAND', 'PLAY_FROM_HAND', 'PASS', 'PUB_BUY', 'OBSERVATORY_DRAW', 'OBSERVATORY_RESOLVE']);

  type FullCard = { id: string; kind: string; special?: string };
  type FullView = {
    status: string;
    phase: string;
    activePlayerIndex: number;
    finalRound: boolean;
    observatoryUsed: string[];
    pendingPubBuy?: { queue: number[] };
    pendingDraw?: { seat: number; card: { id: string } };
    board: { upper: FullCard[]; lower: FullCard[]; stacks: Record<string, number>; discard: number };
    players: {
      id: string;
      rubles: number | null;
      points: number;
      hand: FullCard[] | null;
      handCount: number;
      playArea: { worker: FullCard[]; building: FullCard[]; aristocrat: FullCard[] };
    }[];
    version: number;
    results?: StPetersburgResult[];
    winnerIds?: string[];
    log: { type: string; seq: number }[];
  };
  type Coverage = { upperBuy: boolean; lowerBuy: boolean; addToHand: boolean; playFromHand: boolean; tradeDisplace: boolean; pubBuy: boolean; observatory: boolean };

  /**
   * Play one seeded game to its end over REST, returning the ended (fully-revealed) view + the coverage
   * the run achieved. The driver is deliberately *acquisitive* — it snaps up special buildings (to open
   * the Pub/Observatory windows), takes a card to hand early then plays it, prefers a trading-card
   * displacement, and buys from whichever row it hasn't used yet — so one game touches the whole surface.
   */
  async function playToEnd(app: FastifyInstance, playerCount: number, seed: number): Promise<{ ended: FullView; cover: Coverage; steps: number }> {
    const names = [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }].slice(0, playerCount);
    const id = (await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'stpetersburg', players: names } })).json().game.id as string;
    const readAs = async (seat: string) => (await app.inject({ method: 'GET', url: `/games/${id}?viewer=${seat}` })).json().game as FullView;
    const post = async (seat: string, action: unknown) =>
      (await app.inject({ method: 'POST', url: `/games/${id}/actions?viewer=${seat}`, payload: { playerId: seat, action } })).json().game as FullView;

    const cover: Coverage = { upperBuy: false, lowerBuy: false, addToHand: false, playFromHand: false, tradeDisplace: false, pubBuy: false, observatory: false };
    let lastVersion = -1;

    let view = await readAs('p1');
    let steps = 0;
    for (; steps < 5000 && view.status === 'active'; steps += 1) {
      const seat = view.players[view.activePlayerIndex]!.id;
      view = await readAs(seat); // the active seat sees its own rubles + hand
      // Version is strictly monotonic across the whole game (one bump per applied action).
      if (steps > 0) expect(view.version).toBeGreaterThan(lastVersion);
      lastVersion = view.version;
      const me = view.players.find((p) => p.id === seat)!;

      // ── SP5 interludes: the seat on the clock may only resolve the open window ──
      if (view.pendingPubBuy && view.pendingPubBuy.queue[0] === view.activePlayerIndex) {
        const points = Math.min(5, Math.floor((me.rubles ?? 0) / 2)); // buy the max affordable
        if (points > 0) cover.pubBuy = true;
        view = await post(seat, { type: 'PUB_BUY', points });
        continue;
      }
      if (view.pendingDraw && view.pendingDraw.seat === view.activePlayerIndex) {
        view = await post(seat, { type: 'OBSERVATORY_RESOLVE', choice: me.handCount < 3 ? 'hand' : 'discard' });
        continue;
      }
      // Observatory draw (building phase): view stacks are counts, so legalActions can't offer this —
      // drive it directly, exactly as a client would from its own view.
      const observatory = me.playArea.building.find((c) => c.special === 'observatory' && !view.observatoryUsed.includes(c.id));
      if (view.phase === 'building' && observatory) {
        const stack = (['building', 'aristocrat', 'worker', 'trading'] as const).find((k) => view.board.stacks[k]! >= 2);
        if (stack) {
          cover.observatory = true;
          view = await post(seat, { type: 'OBSERVATORY_DRAW', stack });
          continue;
        }
      }

      // Enumerate the seat's legal moves on its own view (the same cast the UI uses).
      const actions = legalActions(view as unknown as StPetersburgState, seat);

      // A trading-card displacement whenever one is legal (pg. 7).
      const trade = actions.find((a): a is Extract<Action, { type: 'BUY' | 'PLAY_FROM_HAND' }> => (a.type === 'BUY' || a.type === 'PLAY_FROM_HAND') && a.displace !== undefined);
      if (trade) {
        cover.tradeDisplace = true;
        view = await post(seat, trade);
        continue;
      }
      // Once we've stashed a card, play it from hand in a later phase (charged its cost).
      const playHand = actions.find((a) => a.type === 'PLAY_FROM_HAND');
      if (playHand && cover.addToHand) {
        cover.playFromHand = true;
        view = await post(seat, playHand);
        continue;
      }
      // Take one card into hand early (free), to feed the play-from-hand path above.
      if (!cover.addToHand && me.handCount < 3) {
        const add = actions.find((a) => a.type === 'ADD_TO_HAND');
        if (add) {
          cover.addToHand = true;
          view = await post(seat, add);
          continue;
        }
      }
      // Grab a special building we don't yet own (cheap) to unlock the Pub/Observatory windows.
      const ownedSpecials = new Set(me.playArea.building.filter((c) => c.special).map((c) => c.special));
      const rows = [
        ...view.board.upper.map((c, i) => ({ c, row: 'upper' as const, i })),
        ...view.board.lower.map((c, i) => ({ c, row: 'lower' as const, i })),
      ];
      const special = rows.find(({ c }) => c.kind === 'building' && c.special && !ownedSpecials.has(c.special));
      const specialBuy = special && actions.find((a): a is Extract<Action, { type: 'BUY' }> => a.type === 'BUY' && a.row === special.row && a.index === special.i);
      if (special && specialBuy) {
        if (special.row === 'upper') cover.upperBuy = true;
        else cover.lowerBuy = true;
        view = await post(seat, specialBuy);
        continue;
      }
      // Otherwise buy — preferring the row we haven't covered yet, so both get exercised.
      const plainBuys = actions.filter((a): a is Extract<Action, { type: 'BUY' }> => a.type === 'BUY' && a.displace === undefined);
      const lower = plainBuys.find((a) => a.row === 'lower');
      const upper = plainBuys.find((a) => a.row === 'upper');
      const pick = (!cover.lowerBuy && lower) || (!cover.upperBuy && upper) || lower || upper;
      if (pick) {
        if (pick.row === 'upper') cover.upperBuy = true;
        else cover.lowerBuy = true;
        view = await post(seat, pick);
        continue;
      }
      view = await post(seat, { type: 'PASS' });
    }

    return { ended: view, cover, steps };
  }

  /** Assert the ended game's breakdown is internally consistent and the winners obey the tie rule (pg. 6). */
  function assertCoherentEnd(ended: FullView): void {
    expect(ended.status).toBe('ended');
    const results = ended.results!;
    expect(results.map((r) => r.playerId).sort()).toEqual(ended.players.map((p) => p.id).sort());

    // Every breakdown adds up: total = base + aristocrats + money − handPenalty (pg. 5–6).
    for (const r of results) {
      expect(r.total).toBe(r.base + r.aristocrats + r.money - r.handPenalty);
    }

    // At ended, all rubles are revealed — so we can check the tie rule ourselves: highest total wins;
    // ties break on most rubles; a remaining tie is shared.
    const rublesOf = (playerId: string) => ended.players.find((p) => p.id === playerId)!.rubles!;
    const maxTotal = Math.max(...results.map((r) => r.total));
    const topByTotal = results.filter((r) => r.total === maxTotal);
    const maxRubles = Math.max(...topByTotal.map((r) => rublesOf(r.playerId)));
    const expectedWinners = topByTotal.filter((r) => rublesOf(r.playerId) === maxRubles).map((r) => r.playerId);
    expect([...ended.winnerIds!].sort()).toEqual([...expectedWinners].sort());
  }

  /** Assert the move log is a gap-free, typed audit trail whose length matches the final version. */
  function assertLogReplaysSanely(ended: FullView): void {
    expect(ended.log.length).toBe(ended.version); // record() bumps version + appends exactly one entry
    ended.log.forEach((entry, i) => {
      expect(entry.seq).toBe(i + 1); // contiguous 1..N, in order
      expect(KNOWN_TYPES.has(entry.type)).toBe(true); // no move fell through to a raw/unknown type
    });
  }

  for (const { players, seed } of [
    { players: 2, seed: 777 },
    { players: 3, seed: 7 },
    { players: 4, seed: 20260722 },
  ]) {
    it(`plays a complete ${players}-player game over REST — whole surface, coherent end, sane log (seed ${seed})`, async () => {
      const db = createDatabase();
      const app = buildApp({ db, rng: makeRng(seed) });
      await app.ready();
      try {
        const { ended, cover, steps } = await playToEnd(app, players, seed);
        expect(steps).toBeLessThan(5000); // terminated well within the cap

        // The whole action surface was exercised in this one seeded game.
        expect(cover).toEqual({ upperBuy: true, lowerBuy: true, addToHand: true, playFromHand: true, tradeDisplace: true, pubBuy: true, observatory: true });

        assertCoherentEnd(ended);
        assertLogReplaysSanely(ended);
      } finally {
        await app.close();
        db.close();
      }
    }, 60000);
  }
});

describe('mapStPetersburgError', () => {
  it('maps the engine’s domain codes to HTTP (and passes non-domain errors through)', () => {
    expect(mapStPetersburgError(new GameError('PLAYER_NOT_FOUND', 'x'))?.status).toBe(404);
    expect(mapStPetersburgError(new GameError('INVALID_PLAYER_COUNT', 'x'))?.status).toBe(400);
    expect(mapStPetersburgError(new GameError('NOT_YOUR_TURN', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('INSUFFICIENT_RUBLES', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('INVALID_CARD_SLOT', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('DISPLACE_REQUIRED', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('DISPLACE_NOT_ALLOWED', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('INVALID_DISPLACE_TARGET', 'x'))?.status).toBe(409);
    expect(mapStPetersburgError(new GameError('HAND_FULL', 'x'))?.status).toBe(409);
    // SP5 special-card codes all map to 409 (a legal-looking move this state refuses).
    for (const code of ['PUB_PENDING', 'DRAW_PENDING', 'NO_PUB_PENDING', 'NO_DRAW_PENDING', 'INVALID_PUB_POINTS', 'OBSERVATORY_UNAVAILABLE', 'STACK_TOO_SMALL', 'INVALID_RESOLVE_CHOICE'] as const) {
      expect(mapStPetersburgError(new GameError(code, 'x'))?.status).toBe(409);
    }
    expect(mapStPetersburgError(new Error('not ours'))).toBeNull();
  });
});
