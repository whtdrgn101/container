import type { Action, GameView, NewPlayer } from '@container/engine';

const BASE_URL = '/api';

interface ApiError {
  error?: { code?: string; message?: string };
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/** A pre-game lobby: a shareable room whose seats players claim by name before the game starts. */
export interface Lobby {
  id: string;
  seats: number;
  members: (string | null)[];
  status: 'open' | 'started';
  gameId: string | null;
}

/** Throw an Error carrying the server's message (used for any non-2xx response). */
async function fail(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  throw new Error(body.error?.message ?? `Request failed (${response.status})`);
}

// The server sends a per-viewer projection (opponents' secret scoring cards are redacted to null).
async function unwrap(response: Response): Promise<GameView> {
  if (!response.ok) await fail(response);
  return ((await response.json()) as { game: GameView }).game;
}

async function unwrapLobby(response: Response): Promise<Lobby> {
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobby: Lobby }).lobby;
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

/**
 * Apply an action for a player and return the updated state. `viewer` (your seat ids) projects the
 * response for your own seats so the reply never reveals another player's card; omit for hotseat.
 */
export async function applyAction(
  gameId: string,
  playerId: string,
  action: Action,
  viewer?: string,
): Promise<GameView> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap(
    await fetch(`${BASE_URL}/games/${gameId}/actions${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId, action }),
    }),
  );
}

/**
 * Fetch a game's current state by id. `viewer` is a comma-separated list of your seat ids (see only
 * those seats' hidden info); `''` is a spectator (no cards); omit it to follow the active player.
 */
export async function getGame(gameId: string, viewer?: string): Promise<GameView> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap(await fetch(`${BASE_URL}/games/${gameId}${query}`));
}

/** Create an empty lobby with `seats` unclaimed seats and return it (its id is the shareable code). */
export async function createLobby(seats: number): Promise<Lobby> {
  return unwrapLobby(
    await fetch(`${BASE_URL}/lobbies`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ seats }) }),
  );
}

/** Fetch a lobby by code, or throw if it doesn't exist. */
export async function getLobby(id: string): Promise<Lobby> {
  return unwrapLobby(await fetch(`${BASE_URL}/lobbies/${id}`));
}

/** Claim the next open seat in a lobby with `name`; returns the updated lobby and your seat index. */
export async function joinLobby(id: string, name: string): Promise<{ lobby: Lobby; seat: number }> {
  const response = await fetch(`${BASE_URL}/lobbies/${id}/join`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
  if (!response.ok) await fail(response);
  return (await response.json()) as { lobby: Lobby; seat: number };
}

/** Start a full lobby's game and return the created game state. */
export async function startLobby(id: string): Promise<GameView> {
  return unwrap(await fetch(`${BASE_URL}/lobbies/${id}/start`, { method: 'POST' }));
}

/** Absolute ws(s):// URL for the live stream, derived from the current page origin. */
function streamUrl(gameId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BASE_URL}/games/${gameId}/stream`;
}

/**
 * Subscribe to a game's live updates over WebSocket. Calls `onState` with each pushed projection.
 * Reconnects automatically with a short backoff. Returns a function that permanently closes the
 * subscription (call it on unmount / when leaving the game).
 */
export function subscribeGame(gameId: string, onState: (game: GameView) => void, viewer?: string): () => void {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (closed) return;
    const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
    const ws = new WebSocket(`${streamUrl(gameId)}${query}`);
    socket = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; game: GameView };
        if (msg.type === 'state') onState(msg.game);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (closed) return;
      retry = setTimeout(connect, 1000); // reconnect & resume from the fresh snapshot
    };
    ws.onerror = () => ws.close();
  };

  connect();

  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}
