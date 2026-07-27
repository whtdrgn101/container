/**
 * The games-platform API client — **game-agnostic** (roadmap C2).
 *
 * Mirrors the backend's split exactly: this file is the core (games, lobbies, the live stream), and a
 * game's own endpoints live in its own client (`@game-hub/game-container`'s `src/client/api.ts`, serving
 * `/games/:id/container/…`). Nothing here may import a game package (`@game-hub/game-*`) or know what a
 * container, a bid or a scoring card is.
 *
 * **A game's state is `unknown` here on purpose.** Only the game's own board can read it, so every
 * function that returns one is generic in `S`: the shell calls them bare and passes the opaque state
 * to whichever board the registry picked, while a board calls them with its own view type
 * (`api.getGame<GameView>(…)`) and stays fully typed. Don't widen a board to `unknown` to make a call
 * type-check — pass the type parameter instead.
 */

// In dev the Vite server proxies `/api` → the backend (stripping the prefix). In a production build
// the UI is served by the backend itself, so the API lives at the same origin's root.
export const BASE_URL = import.meta.env.PROD ? '' : '/api';

interface ApiError {
  error?: { code?: string; message?: string };
}

export const JSON_HEADERS = { 'content-type': 'application/json' };

/** A claimed lobby seat: who's in it, whether that's a person or the AI, and its chosen colour. */
export interface LobbyMember {
  name: string;
  bot: boolean;
  /** The player colour this seat picked (a palette id), or undefined until one is chosen. */
  color?: string;
  /** For a bot seat, the AI difficulty tier it plays by (CS4), or undefined for the game's default. */
  difficulty?: string;
}

/** A pre-game lobby: a shareable room whose seats players claim by name before the game starts. */
export interface Lobby {
  id: string;
  /** Which game the room is for (roadmap C1) — its seat count is that game's rule, not a constant. */
  gameType: string;
  seats: number;
  members: (LobbyMember | null)[];
  status: 'open' | 'started';
  gameId: string | null;
}

/** Secret-free seat identity carried beside every game state (roadmap C2 / REVIEW §3.3). */
export interface GameIdentity {
  /** Seats in order, name-and-id only — no hidden info. Filled from the module's `summarize`. */
  players: { id: string; name: string }[];
  /** Whose turn it is, or `null` (e.g. a finished game). */
  activePlayerId: string | null;
}

/**
 * A game, plus what a generic caller needs to make sense of it.
 *
 * `gameType` says which board reads `game`; `bots` travels beside the state rather than inside it,
 * because which seats are bots is coordination state the engine never learns about. `players` /
 * `activePlayerId` (REVIEW §3.3) let the shell name seats and apply seat-binding rules **without**
 * duck-typing the opaque `game` blob — the one thing the shell must never read a game's shape for.
 */
export interface GamePayload<S = unknown> extends GameIdentity {
  game: S;
  gameType: string;
  bots: string[];
  /** Each seat's chosen player colour (playerId → palette id). Beside the game like `bots`. */
  colors: Record<string, string>;
}

/** One of the games this server hosts, from `GET /games/catalog`. */
export interface GameInfo {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  /** The game's player-colour palette (ordered ids), so the lobby can offer the pick. */
  colors: string[];
  /**
   * The AI difficulty tiers this game offers (CS4), ordered easy→hard, or absent if it has just one.
   * Present ⇒ the bot-seat affordances show a difficulty picker; absent ⇒ exactly today's UI.
   */
  botDifficulties?: string[];
}

/** A secret-free summary of an in-progress game (for the home-screen "resume" list). */
export interface GameSummary {
  id: string;
  /** Which game this is, so the shell knows which board to open. */
  gameType: string;
  turn: number;
  status: 'active' | 'ended';
  activePlayerId: string | null;
  players: { id: string; name: string }[];
  /** Seats an AI holds. Never offer these to resume — the server already plays them. */
  bots: string[];
}

/** A seat in a new game: a name, plus whether the AI should play it and an optional player-colour pick. */
export interface NewSeat {
  name: string;
  bot?: boolean;
  /** A palette id (from the game's catalog entry). Honoured if valid/unique; omit for the default. */
  color?: string;
  /** For a bot seat, a difficulty tier (from the game's catalog entry). Omit for the default ('normal'). */
  difficulty?: string;
}

/** Throw an Error carrying the server's message (used for any non-2xx response). */
export async function fail(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  throw new Error(body.error?.message ?? `Request failed (${response.status})`);
}

// The server sends a per-viewer projection (opponents' secret cards are redacted to null).
export async function unwrap<S = unknown>(response: Response): Promise<GamePayload<S>> {
  if (!response.ok) await fail(response);
  const body = (await response.json()) as {
    game: S;
    gameType: string;
    bots?: string[];
    colors?: Record<string, string>;
    players?: { id: string; name: string }[];
    activePlayerId?: string | null;
  };
  return {
    game: body.game,
    gameType: body.gameType,
    bots: body.bots ?? [],
    colors: body.colors ?? {},
    players: body.players ?? [],
    activePlayerId: body.activePlayerId ?? null,
  };
}

async function unwrapLobby(response: Response): Promise<Lobby> {
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobby: Lobby }).lobby;
}

/** The games this server hosts — what the picker lists, and where seat bounds come from. */
export async function listGameTypes(): Promise<GameInfo[]> {
  const response = await fetch(`${BASE_URL}/games/catalog`);
  if (!response.ok) await fail(response);
  return ((await response.json()) as { games: GameInfo[] }).games;
}

/** Create a new game of `gameType` and return its initial state. */
export async function createGame<S = unknown>(gameType: string, players: NewSeat[]): Promise<GamePayload<S>> {
  return unwrap<S>(
    await fetch(`${BASE_URL}/games`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ gameType, players }),
    }),
  );
}

/**
 * Apply an action for a player and return the updated state.
 *
 * `action` is opaque: the server delegates all validation to the game's own module, so the shape is
 * the game's business. `viewer` (your seat ids) projects the response for your own seats so the reply
 * never reveals another player's card; omit for hotseat.
 *
 * `expectedVersion` is optimistic concurrency (REVIEW §4.2): pass the version of the state you acted
 * against and the server refuses (`409 STALE_VERSION`) if the game has since moved on. Rather than
 * surface that as an error, we **refetch and return the current state** — a double-click or a second
 * device that lost the race should feel like the board catching up, not a failure. Omit it to apply
 * unconditionally (the old behaviour).
 */
export async function applyAction<S = unknown>(
  gameId: string,
  playerId: string,
  action: unknown,
  viewer?: string,
  expectedVersion?: number,
): Promise<GamePayload<S>> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  const response = await fetch(`${BASE_URL}/games/${gameId}/actions${query}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ playerId, action, ...(expectedVersion !== undefined ? { expectedVersion } : {}) }),
  });
  // Lost the optimistic-concurrency race (a double-click, a stale second device): don't error the
  // user — catch the board up to the current server state, which is what the click would have shown.
  if (response.status === 409) {
    const body = (await response
      .clone()
      .json()
      .catch(() => ({}))) as ApiError;
    if (body.error?.code === 'STALE_VERSION') return getGame<S>(gameId, viewer);
  }
  return unwrap<S>(response);
}

/**
 * Fetch a game's current state by id. `viewer` is a comma-separated list of your seat ids (see only
 * those seats' hidden info); `''` is a spectator (no cards); omit it to follow the active player.
 */
export async function getGame<S = unknown>(gameId: string, viewer?: string): Promise<GamePayload<S>> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap<S>(await fetch(`${BASE_URL}/games/${gameId}${query}`));
}

/** Create an empty lobby for `gameType` with `seats` unclaimed seats (its id is the shareable code). */
export async function createLobby(gameType: string, seats: number): Promise<Lobby> {
  return unwrapLobby(
    await fetch(`${BASE_URL}/lobbies`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ gameType, seats }),
    }),
  );
}

/** List open lobbies that still have a free seat (the home-screen "waiting for players" list). */
export async function listLobbies(): Promise<Lobby[]> {
  const response = await fetch(`${BASE_URL}/lobbies`);
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobbies: Lobby[] }).lobbies;
}

/** List in-progress games so a player who closed their tab can jump back into a seat. */
export async function listActiveGames(): Promise<GameSummary[]> {
  const response = await fetch(`${BASE_URL}/games`);
  if (!response.ok) await fail(response);
  return ((await response.json()) as { games: GameSummary[] }).games;
}

/**
 * Abandon a game nobody intends to finish, so it stops cluttering the in-progress list.
 *
 * A soft delete server-side: the game and its history survive and stay readable, it just can't be
 * played on any more and its bots stop. It is **not** scored — an unfinished game has no winner.
 * Idempotent, so a double-click is harmless.
 */
export async function abandonGame(gameId: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/games/${gameId}/abandon`, { method: 'POST' });
  if (!response.ok) await fail(response);
}

/** A rematch proposal for a finished game: who's agreed, and the new game's id once it starts. */
export interface RematchInfo {
  agreed: string[];
  newGameId: string | null;
}

/** The current rematch proposal for a game (empty when none is open). */
export async function getRematch(gameId: string): Promise<RematchInfo> {
  const response = await fetch(`${BASE_URL}/games/${gameId}/rematch`);
  if (!response.ok) await fail(response);
  return ((await response.json()) as { rematch: RematchInfo }).rematch;
}

/**
 * Propose or accept a rematch of a finished game. `controlledIds` is this client's own seats (`null`
 * for hotseat). Returns the proposal — `newGameId` is set once enough players have agreed and the new
 * game has started.
 */
export async function proposeRematch(gameId: string, controlledIds: string[] | null): Promise<RematchInfo> {
  const response = await fetch(`${BASE_URL}/games/${gameId}/rematch`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ controlledIds }),
  });
  if (!response.ok) await fail(response);
  return ((await response.json()) as { rematch: RematchInfo }).rematch;
}

/** Fetch a lobby by code, or throw if it doesn't exist. */
export async function getLobby(id: string): Promise<Lobby> {
  return unwrapLobby(await fetch(`${BASE_URL}/lobbies/${id}`));
}

/**
 * Claim the next open seat in a lobby with `name`; returns the updated lobby and your seat index.
 * Pass `bot` to hand the seat to the AI instead of a person, `color` to pick a player colour, and
 * `difficulty` (bot seats only) to pick an AI tier.
 */
export async function joinLobby(
  id: string,
  name: string,
  bot = false,
  color?: string,
  difficulty?: string,
): Promise<{ lobby: Lobby; seat: number }> {
  const response = await fetch(`${BASE_URL}/lobbies/${id}/join`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      name,
      bot,
      ...(color !== undefined ? { color } : {}),
      ...(difficulty !== undefined ? { difficulty } : {}),
    }),
  });
  if (!response.ok) await fail(response);
  return (await response.json()) as { lobby: Lobby; seat: number };
}

/** Change a claimed seat's player colour while waiting; returns the updated lobby. */
export async function setLobbyColor(id: string, seat: number, color: string): Promise<Lobby> {
  return unwrapLobby(
    await fetch(`${BASE_URL}/lobbies/${id}/color`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ seat, color }),
    }),
  );
}

/** Start a full lobby's game and return the created game state. */
export async function startLobby<S = unknown>(id: string): Promise<GamePayload<S>> {
  return unwrap<S>(await fetch(`${BASE_URL}/lobbies/${id}/start`, { method: 'POST' }));
}

/** Absolute ws(s):// URL for the live stream, derived from the current page origin. */
function streamUrl(gameId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BASE_URL}/games/${gameId}/stream`;
}

/** The state push every game gets. A board casts `game` to its own view type. */
export interface StatePush {
  type: 'state';
  game: unknown;
  gameType: string;
  bots?: string[];
  /** Each seat's chosen player colour (playerId → palette id). */
  colors?: Record<string, string>;
  /** Secret-free seat identity (REVIEW §3.3), same fields as `GamePayload`. */
  players?: { id: string; name: string }[];
  activePlayerId?: string | null;
}

/** Anything else the server pushes down the same socket — a game's own side-channel. */
export interface GameMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Subscribe to a game's live updates over WebSocket. Reconnects automatically with a short backoff;
 * returns a function that permanently closes the subscription (call it on unmount / when leaving).
 *
 * **One socket per game, and the shell owns it.** `onState` gets every `type: 'state'` push; anything
 * else goes to `onMessage` verbatim for the game's board to interpret. This mirrors the backend: the
 * core pushes state, and a module pushes its own side-channels down the same hub (Container's
 * `type: 'auction'`). The transport must not learn what an auction is — it used to take an `onAuction`
 * callback typed against Container, which is exactly the coupling C2 removes.
 */
export function subscribeGame(
  gameId: string,
  onState: (push: StatePush) => void,
  viewer?: string,
  onMessage?: (message: GameMessage) => void,
): () => void {
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
        const msg = JSON.parse(event.data as string) as GameMessage;
        if (msg.type === 'state') onState(msg as unknown as StatePush);
        else onMessage?.(msg);
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
