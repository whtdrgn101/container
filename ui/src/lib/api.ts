import type { Action, GameState, NewPlayer } from '@container/engine';

const BASE_URL = '/api';

interface ApiError {
  error?: { code?: string; message?: string };
}

async function unwrap(response: Response): Promise<GameState> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  }
  const body = (await response.json()) as { game: GameState };
  return body.game;
}

/** Create a new game and return its initial state. */
export async function createGame(players: NewPlayer[]): Promise<GameState> {
  return unwrap(
    await fetch(`${BASE_URL}/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players }),
    }),
  );
}

/** Apply an action for a player and return the updated state. */
export async function applyAction(gameId: string, playerId: string, action: Action): Promise<GameState> {
  return unwrap(
    await fetch(`${BASE_URL}/games/${gameId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, action }),
    }),
  );
}
