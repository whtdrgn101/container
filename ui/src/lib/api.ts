import { apiUrl, applyAction, fail, getGame, JSON_HEADERS, unwrap } from '@game-hub/ui-kit';
import { isChatPush, isPresencePush } from '@game-hub/kernel/client';
import type { ChatMessage, GameMessage, GamePayload } from '@game-hub/kernel/client';
// The table-option spec is framework-free contract, so it comes from the kernel's `.` barrel rather than
// its React-dependent `/client` subpath — the shell renders a control it is *told* about, never one it knows.
import type { TableOptions, TableOptionSpec } from '@game-hub/kernel';

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
 *
 * **Track D / D2b — the split with `@game-hub/ui-kit`.** The calls a *game client* makes (`getGame`,
 * `applyAction`, `unwrap`, `fail`, `JSON_HEADERS`, `apiUrl`) moved into the ui-kit so an installed game
 * package can reach them without importing `ui/src`; their DTOs (`GamePayload`, `GameMessage`) moved into
 * `@game-hub/kernel/client`. This file keeps everything **only the shell** uses — the catalog, lobbies, the
 * resume list, abandon/rematch, and the socket — and re-exports the shared half so shell code keeps one
 * import site. The base URL is injected once at boot (`main.tsx` → `configureTransport`), because a
 * published package must not depend on Vite's `import.meta.env`.
 */

// The shared half, re-exported so shell code has a single `lib/api` import site (the games import them
// from the ui-kit directly — they must not reach into `ui/src`).
export { apiUrl, applyAction, fail, getGame, JSON_HEADERS, unwrap };
// Chat/presence are platform frames on the socket; since kernel 1.3.0 their DTOs and the guards that
// narrow the open `GameMessage` live on `@game-hub/kernel/client` (both hosts speak them). Re-exported
// here so shell code keeps a single `lib/api` import site (`isChatPush`, `ChatMessage`, …).
export { isChatPush, isPresencePush };
export type { ChatMessage, GameIdentity, GameMessage, GamePayload, PresenceViewer } from '@game-hub/kernel/client';

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
  /**
   * The rule variants this game lets a table pick before the deal (kernel 1.5.0), or absent if its
   * rules are fixed. Present ⇒ the setup form grows a "House rules" section built entirely from this
   * declaration; absent ⇒ exactly the pre-1.5.0 form. The shell never learns what an option *means*.
   */
  tableOptions?: TableOptionSpec[];
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

async function unwrapLobby(response: Response): Promise<Lobby> {
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobby: Lobby }).lobby;
}

/** The games this server hosts — what the picker lists, and where seat bounds come from. */
export async function listGameTypes(): Promise<GameInfo[]> {
  const response = await fetch(apiUrl(`/games/catalog`));
  if (!response.ok) await fail(response);
  return ((await response.json()) as { games: GameInfo[] }).games;
}

/**
 * Create a new game of `gameType` and return its initial state.
 *
 * `options` are the table's rule variants (kernel 1.5.0). Omitted entirely when the game declares none,
 * so a request for any of the seven games that predate the feature is byte-identical to before it.
 */
export async function createGame<S = unknown>(
  gameType: string,
  players: NewSeat[],
  options?: TableOptions,
): Promise<GamePayload<S>> {
  return unwrap<S>(
    await fetch(apiUrl(`/games`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ gameType, players, ...(options ? { options } : {}) }),
    }),
  );
}

/**
 * Create an empty lobby for `gameType` with `seats` unclaimed seats (its id is the shareable code).
 *
 * The table's rule variants are fixed here, when the room is opened, rather than at start — the house
 * rules are agreed before the cards come out, and every player who joins is looking at the same table.
 */
export async function createLobby(gameType: string, seats: number, options?: TableOptions): Promise<Lobby> {
  return unwrapLobby(
    await fetch(apiUrl(`/lobbies`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ gameType, seats, ...(options ? { options } : {}) }),
    }),
  );
}

/** List open lobbies that still have a free seat (the home-screen "waiting for players" list). */
export async function listLobbies(): Promise<Lobby[]> {
  const response = await fetch(apiUrl(`/lobbies`));
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobbies: Lobby[] }).lobbies;
}

/** List in-progress games so a player who closed their tab can jump back into a seat. */
export async function listActiveGames(): Promise<GameSummary[]> {
  const response = await fetch(apiUrl(`/games`));
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
  const response = await fetch(apiUrl(`/games/${gameId}/abandon`), { method: 'POST' });
  if (!response.ok) await fail(response);
}

/** A rematch proposal for a finished game: who's agreed, and the new game's id once it starts. */
export interface RematchInfo {
  agreed: string[];
  newGameId: string | null;
}

/** The current rematch proposal for a game (empty when none is open). */
export async function getRematch(gameId: string): Promise<RematchInfo> {
  const response = await fetch(apiUrl(`/games/${gameId}/rematch`));
  if (!response.ok) await fail(response);
  return ((await response.json()) as { rematch: RematchInfo }).rematch;
}

/**
 * Propose or accept a rematch of a finished game. `controlledIds` is this client's own seats (`null`
 * for hotseat). Returns the proposal — `newGameId` is set once enough players have agreed and the new
 * game has started.
 */
export async function proposeRematch(gameId: string, controlledIds: string[] | null): Promise<RematchInfo> {
  const response = await fetch(apiUrl(`/games/${gameId}/rematch`), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ controlledIds }),
  });
  if (!response.ok) await fail(response);
  return ((await response.json()) as { rematch: RematchInfo }).rematch;
}

/** Fetch a lobby by code, or throw if it doesn't exist. */
export async function getLobby(id: string): Promise<Lobby> {
  return unwrapLobby(await fetch(apiUrl(`/lobbies/${id}`)));
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
  const response = await fetch(apiUrl(`/lobbies/${id}/join`), {
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
    await fetch(apiUrl(`/lobbies/${id}/color`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ seat, color }),
    }),
  );
}

/** Start a full lobby's game and return the created game state. */
export async function startLobby<S = unknown>(id: string): Promise<GamePayload<S>> {
  return unwrap<S>(await fetch(apiUrl(`/lobbies/${id}/start`), { method: 'POST' }));
}

/** Absolute ws(s):// URL for the live stream, derived from the current page origin. */
function streamUrl(gameId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${apiUrl(`/games/${gameId}/stream`)}`;
}

/**
 * In-game chat + presence — platform (shell-owned) coordination, not a game side-channel.
 *
 * These ride the same socket as game state, as `{ type: 'chat' }` / `{ type: 'presence' }` frames. The
 * kernel's `GameMessage` is intentionally open (`{ type: string; [k]: unknown }`), so they flow through
 * `subscribeGame`'s `onMessage` without any kernel change — the shell narrows them by `type`. Since kernel
 * 1.3.0 the DTOs (`ChatMessage`, `PresenceViewer`) and the guards (`isChatPush`/`isPresencePush`) live on
 * `@game-hub/kernel/client`, the shared contract both hosts speak; they are imported and re-exported above.
 *
 * Send a chat message to a game, as one of its seats (`playerId`). Table-public: the server fans it out
 * to every viewer over the socket. A spectator holds no seat and is refused (`INVALID_SENDER`, 400).
 */
export async function sendChat(gameId: string, playerId: string, body: string): Promise<ChatMessage> {
  const response = await fetch(apiUrl(`/games/${gameId}/chat`), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ playerId, body }),
  });
  if (!response.ok) await fail(response);
  return ((await response.json()) as { message: ChatMessage }).message;
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
