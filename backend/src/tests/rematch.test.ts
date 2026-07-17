import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Rematch — the game-agnostic "play again with the same players" flow. Uses Can't Stop as the vehicle
 * (a finished game is easy to produce there): drive a 2-human game to a win with seeded dice, then
 * exercise propose → accept → new game.
 */
function diceRng() {
  const queue: number[] = [];
  const rng = () => (queue.length > 0 ? queue.shift()! : 0);
  const enqueue = (faces: number[]): void => {
    for (const face of faces) queue.push((face - 0.5) / 6);
  };
  return { rng, enqueue };
}

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('rematch', () => {
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

  const createCantStop = async (players: { name: string; bot?: boolean }[]) => {
    const res = await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'cantstop', players } });
    expect(res.statusCode).toBe(201);
    return res.json().game.id as string;
  };

  const roll = (id: string, playerId: string, faces: number[]) => {
    dice.enqueue(faces);
    return app.inject({ method: 'POST', url: `/games/${id}/cantstop/roll`, payload: { playerId } });
  };
  const select = (id: string, playerId: string, columns: number[]) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'SELECT', columns } } });
  const stop = (id: string, playerId: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action: { type: 'STOP' } } });
  const rematch = (id: string, controlledIds: string[] | null) =>
    app.inject({ method: 'POST', url: `/games/${id}/rematch`, payload: { controlledIds } });

  /** Drive a fresh 2-human Can't Stop game to a p1 win (claims columns 2, 12, 3). Returns its id. */
  const winTwoHumanGame = async (): Promise<string> => {
    const id = await createCantStop([{ name: 'Ann' }, { name: 'Bob' }]);
    // Column 2.
    await roll(id, 'p1', [1, 1, 1, 1]);
    await select(id, 'p1', [2, 2]);
    await roll(id, 'p1', [1, 1, 1, 1]);
    await select(id, 'p1', [2]);
    await stop(id, 'p1');
    await roll(id, 'p2', [1, 1, 1, 1]); // Bob busts on the claimed column
    // Column 12.
    await roll(id, 'p1', [6, 6, 6, 6]);
    await select(id, 'p1', [12, 12]);
    await roll(id, 'p1', [6, 6, 6, 6]);
    await select(id, 'p1', [12]);
    await stop(id, 'p1');
    await roll(id, 'p2', [6, 6, 6, 6]);
    // Column 3 → third claim, game ends on the stop.
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3, 3]);
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3, 3]);
    await roll(id, 'p1', [1, 2, 1, 2]);
    await select(id, 'p1', [3]);
    const win = await stop(id, 'p1');
    expect(win.json().game.status).toBe('ended');
    return id;
  };

  it('refuses a rematch until the game has ended', async () => {
    const id = await createCantStop([{ name: 'Ann' }, { name: 'Bob' }]);
    const res = await rematch(id, ['p1']);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('REMATCH_NOT_READY');
  });

  it('needs a second player to accept before it starts', async () => {
    const id = await winTwoHumanGame();

    // p1 proposes: agreed, but no new game yet.
    const proposed = await rematch(id, ['p1']);
    expect(proposed.statusCode).toBe(200);
    expect(proposed.json().rematch.agreed).toEqual(['p1']);
    expect(proposed.json().rematch.newGameId).toBeNull();

    // p1 proposing again can't self-accept.
    expect((await rematch(id, ['p1'])).json().rematch.newGameId).toBeNull();

    // p2 accepts: a fresh game of the same type + players starts.
    const accepted = await rematch(id, ['p2']);
    const newId = accepted.json().rematch.newGameId as string;
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(id);

    const fresh = await app.inject({ method: 'GET', url: `/games/${newId}` });
    expect(fresh.json().gameType).toBe('cantstop');
    expect(fresh.json().game.players.map((p: { name: string }) => p.name)).toEqual(['Ann', 'Bob']);
    expect(fresh.json().game.status).toBe('active'); // brand new game
    expect(fresh.json().game.turn).toBe(1);
  });

  it('starts in one step for a hotseat client that drives every seat', async () => {
    const id = await winTwoHumanGame();
    // controlledIds null ⇒ one device agrees for both humans ⇒ starts immediately.
    const res = await rematch(id, null);
    expect(res.json().rematch.newGameId).toBeTruthy();
  });

  it('is idempotent once started — a later caller gets the same new game', async () => {
    const id = await winTwoHumanGame();
    const first = (await rematch(id, null)).json().rematch.newGameId;
    const second = (await rematch(id, ['p1'])).json().rematch.newGameId;
    expect(second).toBe(first);
  });

  it('carries bot assignments into the rematch', async () => {
    // An all-bot game finishes on create; a watcher restarts it in one click, still all bots.
    const botApp = buildApp({ db: createDatabase(), rng: mulberry32(0xc0ffee) });
    await botApp.ready();
    const created = await botApp.inject({
      method: 'POST',
      url: '/games',
      payload: { gameType: 'cantstop', players: [{ name: 'Ann', bot: true }, { name: 'Bob', bot: true }] },
    });
    const id = created.json().game.id as string;
    expect(created.json().game.status).toBe('ended');

    const res = await botApp.inject({ method: 'POST', url: `/games/${id}/rematch`, payload: { controlledIds: null } });
    const newId = res.json().rematch.newGameId as string;
    expect(newId).toBeTruthy();

    const fresh = await botApp.inject({ method: 'GET', url: `/games/${newId}` });
    expect(fresh.json().bots).toEqual(['p1', 'p2']); // same seats are still AI
    await botApp.close();
  });

  it('reports the current proposal on GET', async () => {
    const id = await winTwoHumanGame();
    expect((await app.inject({ method: 'GET', url: `/games/${id}/rematch` })).json().rematch).toEqual({
      gameId: id,
      agreed: [],
      newGameId: null,
    });
    await rematch(id, ['p1']);
    expect((await app.inject({ method: 'GET', url: `/games/${id}/rematch` })).json().rematch.agreed).toEqual(['p1']);
  });

  it('refuses a rematch on an abandoned game', async () => {
    const id = await winTwoHumanGame();
    await app.inject({ method: 'POST', url: `/games/${id}/abandon` });
    const res = await rematch(id, ['p1']);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GAME_ABANDONED');
  });
});
