import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGame } from '@game-hub/game-stoneage/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;

/**
 * Stone Age bootstrap (roadmap SA0) over REST — the platform proof that a third game registers and
 * renders, coexisting with Container and Can't Stop. It has no playable actions yet (each lands in its
 * own stage), so `/actions` is refused.
 */
describe('Stone Age bootstrap', () => {
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

  it('is listed in the catalog alongside the other games', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as { id: string }[];
    expect(catalog.map((g) => g.id)).toEqual(['container', 'cantstop', 'stoneage', 'stpetersburg', 'russianrailroads']);
  });

  it('deals a fresh game with the Stone Age starting setup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().gameType).toBe('stoneage');
    const game = res.json().game;
    expect(game.round).toBe(1);
    expect(game.phase).toBe('placement');
    expect(game.players.map((p: { name: string; people: number; food: number }) => [p.name, p.people, p.food])).toEqual(
      [
        ['Ann', 5, 12],
        ['Bob', 5, 12],
      ],
    );
  });

  it('places people over REST (SA1) and passes the turn', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    const placed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'forest', count: 3 } },
    });
    expect(placed.statusCode).toBe(200);
    expect(placed.json().game.placements.forest).toEqual({ p1: 3 });
    expect(placed.json().game.activePlayerIndex).toBe(1); // Bob is up

    // Off-turn / illegal placements are refused.
    const offTurn = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'hunt', count: 1 } },
    });
    expect(offTurn.statusCode).toBe(409);
    expect(offTurn.json().error.code).toBe('NOT_YOUR_TURN');

    const badPayload = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'PLACE', place: 'nowhere', count: 1 } },
    });
    expect(badPayload.statusCode).toBe(400); // parseAction rejects an unknown place
  });

  it("enforces Stone Age's 2–4 seat range on lobbies", async () => {
    const tooMany = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 5, gameType: 'stoneage' } });
    expect(tooMany.statusCode).toBe(400);
    const ok = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 4, gameType: 'stoneage' } });
    expect(ok.statusCode).toBe(201);
  });
});

/** Deterministic dice: `die = floor(rng()*6)+1`, so `(face-0.5)/6` yields exactly `face`. */
function diceRng() {
  const queue: number[] = [];
  const rng = () => (queue.length > 0 ? queue.shift()! : 0);
  const enqueue = (faces: number[]): void => {
    for (const face of faces) queue.push((face - 0.5) / 6);
  };
  return { rng, enqueue };
}

describe('Stone Age gathering (SA2)', () => {
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

  const placeAction = (id: string, playerId: string, place: string, count: number) =>
    app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId, action: { type: 'PLACE', place, count } },
    });

  const roll = (id: string, playerId: string, place: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/stoneage/roll`, payload: { playerId, place } });
  const take = (id: string, playerId: string, toolIndices: number[] = []) =>
    app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId, action: { type: 'TAKE_GATHER', toolIndices } },
    });

  it('gathers resources by rolling dice server-side', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    // A full placement round: Ann fills the forest, Bob the clay pit — both out of people.
    await placeAction(id, 'p1', 'forest', 5);
    await placeAction(id, 'p2', 'clayPit', 5);

    // The action phase begins with Ann (start player) on the forest.
    const before = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(before.json().game.phase).toBe('actions');

    // Roll (server-side): five sixes = 30. It becomes a pending gather; nothing is taken yet.
    dice.enqueue([6, 6, 6, 6, 6]);
    const rolled = await roll(id, 'p1', 'forest');
    expect(rolled.statusCode).toBe(200);
    expect(rolled.json().game.pendingGather).toEqual({ place: 'forest', dice: [6, 6, 6, 6, 6] });
    expect(rolled.json().game.players[0].resources.wood).toBe(0); // not taken yet

    // Take it (no tools): wood per full 3 → 10 wood, people returned.
    const taken = await take(id, 'p1');
    expect(taken.statusCode).toBe(200);
    expect(taken.json().game.players[0].resources.wood).toBe(10);
    expect(taken.json().game.placements.forest).toEqual({});
    expect(taken.json().game.pendingGather).toBeNull();
  });

  it('hunts for food by rolling dice (SA3)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    await placeAction(id, 'p1', 'hunt', 5);
    await placeAction(id, 'p2', 'forest', 5);

    dice.enqueue([6, 6, 6, 6, 6]); // total 30, food per full 2 → 15
    await roll(id, 'p1', 'hunt');
    const taken = await take(id, 'p1');
    expect(taken.statusCode).toBe(200);
    expect(taken.json().game.players[0].food).toBe(27); // 12 starting + 15
  });

  it('spends tools to boost a gather roll (SA4b)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    // Ann puts a worker on the tool maker and the forest; Bob fills the quarry → action phase.
    await placeAction(id, 'p1', 'toolMaker', 1);
    await placeAction(id, 'p2', 'quarry', 5);
    await placeAction(id, 'p1', 'forest', 4);

    // Ann takes a value-1 tool, then rolls the forest and adds the tool to the total.
    await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'USE', place: 'toolMaker' } },
    });
    dice.enqueue([2, 2, 2, 2]); // total 8; +1 tool = 9 → wood 9/3 = 3 (without the tool it'd be 8/3 = 2)
    const rolled = await roll(id, 'p1', 'forest');
    expect(rolled.json().game.players[0].tools).toEqual([1]);
    const taken = await take(id, 'p1', [0]); // spend tool 0
    expect(taken.json().game.players[0].resources.wood).toBe(3);
    expect(taken.json().game.players[0].toolsUsed).toEqual([true]); // tool spent for the round
  });

  it('uses a non-dice place — the field raises food production (SA6)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    // A placement round that leaves Ann with a field (to use) and a hunt.
    await placeAction(id, 'p1', 'field', 1);
    await placeAction(id, 'p2', 'clayPit', 5);
    await placeAction(id, 'p1', 'hunt', 4);

    const used = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'USE', place: 'field' } },
    });
    expect(used.statusCode).toBe(200);
    expect(used.json().game.players[0].foodTrack).toBe(1);
  });

  it('feeds every player and rolls into the next round (SA7–8)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    // Placement → action phase, then both players gather (roll then take) → feeding phase.
    await placeAction(id, 'p1', 'hunt', 5);
    await placeAction(id, 'p2', 'forest', 5);
    dice.enqueue([1, 1, 1, 1, 1]); // Ann's hunt
    await roll(id, 'p1', 'hunt');
    await take(id, 'p1');
    dice.enqueue([1, 1, 1, 1, 1]); // Bob's forest
    await roll(id, 'p2', 'forest');
    await take(id, 'p2');

    const feeding = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(feeding.json().game.phase).toBe('feeding');

    // Both players feed (12 starting food ≥ 5 people, so no shortfall) → the round rolls over.
    await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'FEED' } },
    });
    const afterFeed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'FEED' } },
    });
    expect(afterFeed.statusCode).toBe(200);
    const game = afterFeed.json().game;
    expect(game.round).toBe(2);
    expect(game.phase).toBe('placement');
    expect(game.startPlayerIndex).toBe(1); // start marker passed one seat left
    expect(game.players[0].food).toBe(9); // Ann: 12 + hunt floor(5/2)=2 = 14, − 5 people = 9
  });

  it('refuses a GATHER posted to /actions — dice are server-only', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'GATHER', place: 'forest', dice: [6, 6] } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.message).toMatch(/server-only/);
  });
});

/**
 * SA9 — buildings, over REST. A constant rng near 1 makes setup deterministic two ways at once: the
 * building deck stays in deck order (so `building1`'s top is `b01`, cost 2 wood + 1 brick, worth 10),
 * and every gather die rolls a 6.
 */
describe('Stone Age buildings (SA9)', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db, rng: () => 0.9999 });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const place = (id: string, playerId: string, p: string, count: number) =>
    app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId, action: { type: 'PLACE', place: p, count } },
    });
  const roll = (id: string, playerId: string, p: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/stoneage/roll`, payload: { playerId, place: p } });
  const take = (id: string, playerId: string) =>
    app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId, action: { type: 'TAKE_GATHER', toolIndices: [] } },
    });

  it('deals a building stack per player and buys a building for its exact points', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    const start = created.json().game;
    expect(start.buildings).toHaveLength(2);
    expect(start.buildings[0][0].id).toBe('b01'); // deck order → 2 wood + 1 brick

    // Ann spreads onto the forest, the clay pit, and building slot 1; Bob fills the quarry.
    await place(id, 'p1', 'forest', 2);
    await place(id, 'p2', 'quarry', 5);
    await place(id, 'p1', 'clayPit', 2);
    await place(id, 'p1', 'building1', 1); // 5 placed → action phase, Ann up

    // Ann gathers first (roll then take, all 6s → 4 wood, 3 brick), then pays 2 wood + 1 brick for b01.
    await roll(id, 'p1', 'forest'); // 12 / 3 = 4 wood
    await take(id, 'p1');
    await roll(id, 'p1', 'clayPit'); // 12 / 4 = 3 brick
    await take(id, 'p1');
    const built = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUILD', stack: 0, resources: { wood: 2, brick: 1 } } },
    });
    expect(built.statusCode).toBe(200);
    const ann = built.json().game.players[0];
    expect(ann.score).toBe(10); // 2×3 + 1×4
    expect(ann.buildings).toBe(1);
    expect(ann.resources).toMatchObject({ wood: 2, brick: 2 }); // 4−2 wood, 3−1 brick
    expect(built.json().game.buildings[0][0].id).toBe('b02'); // next tile revealed
  });

  it('rejects a BUILD with no person on the slot (409) and a malformed one (400)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    // Reach the action phase with nobody on a building.
    await place(id, 'p1', 'forest', 5);
    await place(id, 'p2', 'quarry', 5);
    const noPerson = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUILD', stack: 0, resources: { wood: 1 } } },
    });
    expect(noPerson.statusCode).toBe(409);
    expect(noPerson.json().error.code).toBe('INVALID_BUILD');

    const malformed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUILD', stack: 0, resources: { wood: -1 } } },
    });
    expect(malformed.statusCode).toBe(400);
  });

  it('acquires a civilization card for its slot cost and applies the effect (SA10)', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;
    // Deck order → card slot 0 is cv01 (green "writing", immediate effect: take a tool), cost 1 resource.
    expect(created.json().game.cardDisplay[0].id).toBe('cv01');

    await place(id, 'p1', 'card1', 1); // Ann → card slot 0
    await place(id, 'p2', 'quarry', 5);
    await place(id, 'p1', 'forest', 4); // → action phase, Ann up

    // Ann gathers wood, then pays 1 wood for the card → gains a tool and keeps the card.
    await roll(id, 'p1', 'forest');
    await take(id, 'p1'); // all 6s → 24/3 = 8 wood
    const got = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'ACQUIRE_CARD', slot: 0, resources: { wood: 1 } } },
    });
    expect(got.statusCode).toBe(200);
    const ann = got.json().game.players[0];
    expect(ann.civCards).toEqual(['cv01']);
    expect(ann.tools).toEqual([1]); // the card's immediate effect
    expect(ann.resources.wood).toBe(7); // 8 − 1 paid
    expect(got.json().game.cardDisplay[0]).toBeNull(); // slot emptied
  });
});

/** A real PRNG (mulberry32) so an all-bot game advances through varied dice/shuffles. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * SA12 — AI seats end-to-end. The bot runs server-side: creating an all-bot game ticks it forward, and
 * with no human ever on the clock the runner plays the whole game out synchronously (like Container /
 * Can't Stop). Proves the bot's actions are legal over REST and that a game moves with no browser open.
 */
describe('Stone Age bots (SA12)', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db, rng: mulberry32(0x5a5a) });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('plays an all-bot game to a finish on its own (server-side, no client)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: {
        gameType: 'stoneage',
        players: [
          { name: 'Ann', bot: true },
          { name: 'Bob', bot: true },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const game = response.json().game;
    expect(game.status).toBe('ended'); // the runner played it out
    expect(game.results).not.toBeNull();
    expect(game.winnerIds.length).toBeGreaterThanOrEqual(1);
    expect(response.json().bots).toEqual(['p1', 'p2']); // both seats recorded as AI
  });

  it('lets a bot take its turn after a human acts', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Human' }, { name: 'Bot', bot: true }] },
    });
    expect(created.json().bots).toEqual(['p2']);
    const id = created.json().game.id as string;

    // Human (p1) places; the bot (p2) then plays its placement turn server-side and hands back to p1.
    const placed = await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'hunt', count: 1 } },
    });
    expect(placed.statusCode).toBe(200);
    // The bot placed too (p2 has people on the board), and it's p1's move again (or the phase moved on).
    const game = placed.json().game;
    const p2Placed = Object.values(game.placements).some(
      (byPlayer) => (byPlayer as Record<string, number>)['p2'] !== undefined,
    );
    expect(p2Placed).toBe(true);
  });
});

/** Pull-based reader over an injected WebSocket: `next()` resolves with the next JSON message. */
function wsReader(socket: WsClient): () => Promise<{ type: string; game: { cardDeckCount: number } }> {
  type Msg = { type: string; game: { cardDeckCount: number } };
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

/**
 * §4.6 — the undrawn civilization-card deck is a secret (its order is the next cards to be dealt), so it
 * must never leave the engine boundary: `viewFor` ships only a `cardDeckCount`. This is the honest proof,
 * the SP wire-test pattern (`stpetersburg.test.ts`) mirrored — a serialized REST reply *and* WS push for a
 * mid-game state carry no undrawn card id, while the count is present and correct.
 */
describe('Stone Age deck redaction (§4.6)', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    // A constant rng near 1 keeps the civ deck in deck order (no shuffle), so the reference game built
    // below deals an identical deck — giving us the exact undrawn card ids to prove stay off the wire.
    app = buildApp({ db, rng: () => 0.9999 });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  it('never puts an undrawn card id on the wire over REST or the WS, but sends the count', async () => {
    // The engine reference: the same deterministic deck the app deals, so we know its undrawn ids.
    const reference = createGame({ id: 'ref', players: [{ name: 'Ann' }, { name: 'Bob' }], rng: () => 0.9999 });
    const undrawnIds = reference.cardDeck.map((c) => c.id);
    const shownId = reference.cardDisplay.find((c) => c !== null)!.id; // a face-up card that MUST be on the wire
    expect(undrawnIds.length).toBe(32); // 36-card deck − 4 dealt to the display
    expect(undrawnIds).not.toContain(shownId);

    const created = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'stoneage', players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    const id = created.json().game.id as string;

    // Advance to a genuine mid-game position (round 1, actions phase) without buying a card, so the deck
    // is unchanged from setup and its undrawn ids still match the reference.
    await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p1', action: { type: 'PLACE', place: 'forest', count: 5 } },
    });
    await app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId: 'p2', action: { type: 'PLACE', place: 'clayPit', count: 5 } },
    });

    // REST: the count is present and correct; the raw serialized game carries no undrawn card id, and
    // there is no `cardDeck` array at all — but the face-up display card is there.
    const rest = await app.inject({ method: 'GET', url: `/games/${id}` });
    expect(rest.json().game.phase).toBe('actions'); // mid-game
    expect(rest.json().game.cardDeckCount).toBe(32);
    expect(rest.json().game.cardDeck).toBeUndefined();
    const restWire = JSON.stringify(rest.json().game);
    for (const cardId of undrawnIds) expect(restWire).not.toContain(cardId);
    expect(restWire).toContain(shownId); // the public display is not redacted

    // WS push: the same redaction holds on the real-time channel.
    const socket = await app.injectWS(`/games/${id}/stream`);
    const next = wsReader(socket);
    const initial = await next();
    expect(initial.type).toBe('state');
    expect(initial.game.cardDeckCount).toBe(32);
    const wsWire = JSON.stringify(initial.game);
    for (const cardId of undrawnIds) expect(wsWire).not.toContain(cardId);
    socket.close();
  });
});
