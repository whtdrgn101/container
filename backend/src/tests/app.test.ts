import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Action, GameState } from '@container/engine';
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

function act(gameId: string, playerId: string, action: Action) {
  return app.inject({ method: 'POST', url: `/games/${gameId}/actions`, payload: { playerId, action } });
}

describe('POST /games', () => {
  it('creates a 3-player game', async () => {
    const game = await createThreePlayerGame();
    expect(game.players).toHaveLength(3);
    expect(game.actionsRemaining).toBe(2);
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

describe('POST /games/:id/actions', () => {
  it('produces containers and persists the new state', async () => {
    const game = await createThreePlayerGame();

    const response = await act(game.id, 'p1', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.version).toBe(1);
    expect(updated.actionsRemaining).toBe(1);
    expect(updated.players[0]?.factoryStore).toHaveLength(2);
    expect(updated.players[1]?.money).toBe(21); // union wage to the right

    const reload = await app.inject({ method: 'GET', url: `/games/${game.id}` });
    expect((reload.json().game as GameState).version).toBe(1);
  });

  it('builds a factory', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'BUILD_FACTORY', color: 'red' });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).players[0]?.factories).toHaveLength(2);
  });

  it('rejects BUILD_FACTORY without a color (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUILD_FACTORY' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_ACTION');
  });

  it('rejects an unknown action type via schema (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'NONSENSE' } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('ends a turn, advancing to the next player', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'END_TURN' });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.activePlayerIndex).toBe(1);
    expect(updated.actionsRemaining).toBe(2);
  });

  it('rejects an action from a player whose turn it is not (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p2', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_YOUR_TURN');
  });

  it('rejects a third action in one turn (409)', async () => {
    const game = await createThreePlayerGame();
    await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    const third = await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.code).toBe('NO_ACTIONS_REMAINING');
  });

  it('returns 404 when acting in an unknown game', async () => {
    const response = await act('nope', 'p1', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 404 for an unknown player', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'ghost', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PLAYER_NOT_FOUND');
  });
});
