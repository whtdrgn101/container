import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

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
    expect(catalog.map((g) => g.id)).toEqual(['container', 'cantstop', 'stoneage']);
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
    expect(game.players.map((p: { name: string; people: number; food: number }) => [p.name, p.people, p.food])).toEqual([
      ['Ann', 5, 12],
      ['Bob', 5, 12],
    ]);
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

  it('enforces Stone Age\'s 2–4 seat range on lobbies', async () => {
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
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'PLACE', place, count } } });

  const roll = (id: string, playerId: string, place: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/stoneage/roll`, payload: { playerId, place } });
  const take = (id: string, playerId: string, toolIndices: number[] = []) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'TAKE_GATHER', toolIndices } } });

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
    await app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId: 'p1', action: { type: 'USE', place: 'toolMaker' } } });
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
    await app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId: 'p1', action: { type: 'FEED' } } });
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
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'PLACE', place: p, count } } });
  const roll = (id: string, playerId: string, p: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/stoneage/roll`, payload: { playerId, place: p } });
  const take = (id: string, playerId: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'TAKE_GATHER', toolIndices: [] } } });

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
});
