import type { Color, GameState, NewPlayer } from '@container/engine';

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

/** Run a player's Produce action and return the updated state. */
export async function produce(gameId: string, playerId: string, select?: Color[]): Promise<GameState> {
  return unwrap(
    await fetch(`${BASE_URL}/games/${gameId}/produce`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, select }),
    }),
  );
}
