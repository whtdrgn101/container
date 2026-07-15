import type { Action, GameView, NewPlayer } from '@container/engine';

const BASE_URL = '/api';

interface ApiError {
  error?: { code?: string; message?: string };
}

// The server sends a per-viewer projection (opponents' secret scoring cards are redacted to null).
async function unwrap(response: Response): Promise<GameView> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiError;
    throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  }
  const body = (await response.json()) as { game: GameView };
  return body.game;
}

/** Create a new game and return its initial state. */
export async function createGame(players: NewPlayer[]): Promise<GameView> {
  return unwrap(
    await fetch(`${BASE_URL}/games`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ players }),
    }),
  );
}

/** Apply an action for a player and return the updated state. */
export async function applyAction(gameId: string, playerId: string, action: Action): Promise<GameView> {
  return unwrap(
    await fetch(`${BASE_URL}/games/${gameId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, action }),
    }),
  );
}
