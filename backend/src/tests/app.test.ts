import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GameState } from '@container/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';

let app: FastifyInstance;

beforeEach(() => {
  app = buildApp({ db: createDatabase(':memory:') });
});

afterEach(async () => {
  await app.close();
});

async function createThreePlayerGame(): Promise<GameState> {
  const response = await app.inject({
    method: 'POST',
    url: '/games',
    payload: { players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
  });
  expect(response.statusCode).toBe(201);
  return response.json().game as GameState;
}

describe('POST /games', () => {
  it('creates a 3-player game', async () => {
    const game = await createThreePlayerGame();
    expect(game.id).toBeTruthy();
    expect(game.players).toHaveLength(3);
    expect(game.players[0]?.money).toBe(20);
  });

  it('rejects an invalid player count with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PLAYER_COUNT');
  });

  it('rejects a malformed body via schema validation', async () => {
    const response = await app.inject({ method: 'POST', url: '/games', payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /games/:id', () => {
  it('returns a persisted game', async () => {
    const created = await createThreePlayerGame();
    const response = await app.inject({ method: 'GET', url: `/games/${created.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().game.id).toBe(created.id);
  });

  it('returns 404 for an unknown game', async () => {
    const response = await app.inject({ method: 'GET', url: '/games/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('GAME_NOT_FOUND');
  });
});

describe('POST /games/:id/produce', () => {
  it('produces containers and persists the new state', async () => {
    const game = await createThreePlayerGame();

    const produceResponse = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/produce`,
      payload: { playerId: 'p1' },
    });
    expect(produceResponse.statusCode).toBe(200);
    const updated = produceResponse.json().game as GameState;
    expect(updated.version).toBe(1);
    expect(updated.players[0]?.factoryStore).toHaveLength(2);
    expect(updated.players[0]?.money).toBe(19);
    expect(updated.players[1]?.money).toBe(21); // union wage to the right

    // The change is durable.
    const reload = await app.inject({ method: 'GET', url: `/games/${game.id}` });
    expect((reload.json().game as GameState).version).toBe(1);
  });

  it('returns 404 when producing in an unknown game', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games/nope/produce',
      payload: { playerId: 'p1' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for an unknown player', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/produce`,
      payload: { playerId: 'ghost' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PLAYER_NOT_FOUND');
  });

  it('returns 409 for an illegal move (factory storage full)', async () => {
    const game = await createThreePlayerGame();
    // First produce fills the 2-slot factory district (1 starting + 1 produced).
    await app.inject({ method: 'POST', url: `/games/${game.id}/produce`, payload: { playerId: 'p1' } });
    const second = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/produce`,
      payload: { playerId: 'p1' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('STORAGE_LIMIT_EXCEEDED');
  });
});
