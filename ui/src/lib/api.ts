import type { Action, GameView, NewPlayer } from '@container/engine';

// In dev the Vite server proxies `/api` → the backend (stripping the prefix). In a production build
// the UI is served by the backend itself, so the API lives at the same origin's root.
const BASE_URL = import.meta.env.PROD ? '' : '/api';

interface ApiError {
  error?: { code?: string; message?: string };
}

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * A pending delivery auction, as this client is allowed to see it (A1).
 *
 * The server keeps the bids; this projection carries only what the viewer may know. During
 * `bidding` you can see *that* an opponent has bid but never *what* — including if you're the
 * deliverer, which is the point: you choose whether to buy out without knowing what you'd be paid.
 * `revealed` fills in only once every opponent has committed.
 */
export interface DeliveryAuctionView {
  gameId: string;
  delivererId: string;
  cargo: string[];
  /** `runoff`: the leaders tied and are secretly adding cash to their existing bid (pg. 16). */
  phase: 'bidding' | 'runoff' | 'decision';
  /** Seats owing a bid **this round** — in a runoff, only the tied players. */
  bidders: { playerId: string; hasBid: boolean }[];
  yourBid: number | null;
  /** Opening bids; revealed once they're all in, and stay visible through a runoff. */
  revealed: Record<string, number> | null;
  /** Extra cash added in the runoff; revealed once the runoff closes. */
  runoffRevealed: Record<string, number> | null;
  winningBid: number | null;
  /** Bidders the deliverer must pick between when a runoff ends still level. Usually empty. */
  choiceRequired: string[];
}

/** A claimed lobby seat: who's in it, and whether that's a person or the AI. */
export interface LobbyMember {
  name: string;
  bot: boolean;
}

/** A pre-game lobby: a shareable room whose seats players claim by name before the game starts. */
export interface Lobby {
  id: string;
  /** Which game the room is for (roadmap C1). Always 'container' until C2 offers a picker. */
  gameType: string;
  seats: number;
  members: (LobbyMember | null)[];
  status: 'open' | 'started';
  gameId: string | null;
}

/**
 * A game plus the seats an AI holds. `bots` travels beside the state rather than inside it: which
 * seats are bots is coordination state, and the engine never learns about it.
 */
export interface GamePayload {
  game: GameView;
  bots: string[];
}

/** Throw an Error carrying the server's message (used for any non-2xx response). */
async function fail(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  throw new Error(body.error?.message ?? `Request failed (${response.status})`);
}

// The server sends a per-viewer projection (opponents' secret scoring cards are redacted to null).
async function unwrap(response: Response): Promise<GamePayload> {
  if (!response.ok) await fail(response);
  const body = (await response.json()) as { game: GameView; bots?: string[] };
  return { game: body.game, bots: body.bots ?? [] };
}

async function unwrapLobby(response: Response): Promise<Lobby> {
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobby: Lobby }).lobby;
}

/** A seat in a new game: a name, plus whether the AI should play it. */
export type NewSeat = NewPlayer & { bot?: boolean };

/** Create a new game and return its initial state. */
export async function createGame(players: NewSeat[]): Promise<GamePayload> {
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
): Promise<GamePayload> {
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
export async function getGame(gameId: string, viewer?: string): Promise<GamePayload> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap(await fetch(`${BASE_URL}/games/${gameId}${query}`));
}

/**
 * Endpoints that belong to Container specifically, rather than to the games platform.
 *
 * The server hosts games plural (roadmap C1), so each game's own routes live under
 * `/games/:id/<gameType>/…` — the delivery auction is Container's, not something every game has.
 * Only this game's own endpoints go here; `/games/:id` and `/games/:id/actions` are the shared core's
 * and stay unprefixed.
 *
 * Hardcoding the type is honest for now: this whole client *is* Container's board. C2 splits it into
 * a generic shell plus a typed per-game client, and this constant is the seam that becomes.
 */
const gameRoute = (gameId: string, path: string) => `${BASE_URL}/games/${gameId}/container${path}`;

/**
 * Fetch the open delivery auction, as seen by one `viewer` seat, or `null` if none is open.
 *
 * `viewer` is a *single* seat, not a list: bids are per-player, so a hotseat client holding every
 * seat asks once per player as it prompts them.
 */
export async function getAuction(gameId: string, viewer?: string): Promise<DeliveryAuctionView | null> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  const response = await fetch(gameRoute(gameId, `/auction${query}`));
  if (!response.ok) await fail(response);
  return ((await response.json()) as { auction: DeliveryAuctionView | null }).auction;
}

/** Place one seat's sealed bid. $0 is a legal bluff. Returns the auction as that bidder sees it. */
export async function placeBid(gameId: string, playerId: string, bid: number): Promise<DeliveryAuctionView> {
  const response = await fetch(gameRoute(gameId, '/auction/bids'), {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ playerId, bid }),
  });
  if (!response.ok) await fail(response);
  return ((await response.json()) as { auction: DeliveryAuctionView }).auction;
}

/**
 * Deliverer only: accept the high bid, or `buyout` to pay the Bank and keep the containers.
 * `winnerId` names the tied bidder who takes the cargo — required exactly when the auction reports
 * `choiceRequired` and you are not buying out.
 */
export async function resolveAuction(
  gameId: string,
  playerId: string,
  buyout: boolean,
  viewer?: string,
  winnerId?: string,
): Promise<GamePayload> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap(
    await fetch(gameRoute(gameId, `/auction/resolve${query}`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ playerId, buyout, ...(winnerId ? { winnerId } : {}) }),
    }),
  );
}

/** Create an empty lobby with `seats` unclaimed seats and return it (its id is the shareable code). */
export async function createLobby(seats: number): Promise<Lobby> {
  return unwrapLobby(
    await fetch(`${BASE_URL}/lobbies`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ seats }) }),
  );
}

/** List open lobbies that still have a free seat (the home-screen "waiting for players" list). */
export async function listLobbies(): Promise<Lobby[]> {
  const response = await fetch(`${BASE_URL}/lobbies`);
  if (!response.ok) await fail(response);
  return ((await response.json()) as { lobbies: Lobby[] }).lobbies;
}

/** A secret-free summary of an in-progress game (for the home-screen "resume" list). */
export interface GameSummary {
  id: string;
  /** Which game this is (roadmap C1), so C2's shell knows which board to open. */
  gameType: string;
  turn: number;
  status: 'active' | 'ended';
  activePlayerId: string | null;
  players: { id: string; name: string }[];
  /** Seats an AI holds. Never offer these to resume — the server already plays them. */
  bots: string[];
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

/** Fetch a lobby by code, or throw if it doesn't exist. */
export async function getLobby(id: string): Promise<Lobby> {
  return unwrapLobby(await fetch(`${BASE_URL}/lobbies/${id}`));
}

/**
 * Claim the next open seat in a lobby with `name`; returns the updated lobby and your seat index.
 * Pass `bot` to hand the seat to the AI instead of a person.
 */
export async function joinLobby(id: string, name: string, bot = false): Promise<{ lobby: Lobby; seat: number }> {
  const response = await fetch(`${BASE_URL}/lobbies/${id}/join`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, bot }),
  });
  if (!response.ok) await fail(response);
  return (await response.json()) as { lobby: Lobby; seat: number };
}

/** Start a full lobby's game and return the created game state. */
export async function startLobby(id: string): Promise<GamePayload> {
  return unwrap(await fetch(`${BASE_URL}/lobbies/${id}/start`, { method: 'POST' }));
}

/** Absolute ws(s):// URL for the live stream, derived from the current page origin. */
function streamUrl(gameId: string): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${BASE_URL}/games/${gameId}/stream`;
}

/**
 * Subscribe to a game's live updates over WebSocket. Calls `onState` with each pushed projection,
 * and `onAuction` when a delivery auction opens, gains a bid, reveals, or closes (`null`).
 * Reconnects automatically with a short backoff. Returns a function that permanently closes the
 * subscription (call it on unmount / when leaving the game).
 */
export function subscribeGame(
  gameId: string,
  onState: (game: GameView, bots: string[]) => void,
  viewer?: string,
  onAuction?: (auction: DeliveryAuctionView | null) => void,
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
        const msg = JSON.parse(event.data as string) as {
          type: string;
          game: GameView;
          bots?: string[];
          auction: DeliveryAuctionView | null;
        };
        if (msg.type === 'state') onState(msg.game, msg.bots ?? []);
        else if (msg.type === 'auction') onAuction?.(msg.auction);
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
