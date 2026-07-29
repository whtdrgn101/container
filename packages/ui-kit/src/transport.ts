import type { GamePayload } from '@game-hub/kernel/client';

/**
 * The **game-facing** half of the platform's REST client (Track D / D2b).
 *
 * The hub's `ui/src/lib/api.ts` used to own all of it, and every game's own `api.ts` reached it through
 * the shell's `@` alias — impossible for an installed game package. So the calls a *game client* makes
 * live here, and the shell keeps what only it uses (the catalog, lobbies, the resume list, rematch, and
 * the WebSocket — **the shell owns the socket**, design-patterns §1).
 *
 * The **DTOs** these return are contract and live in `@game-hub/kernel/client`; this module is the
 * implementation. Everything is generic in `S`: a call hands back `GamePayload<S>` and a game's `api.ts`
 * pins `S` to its own view type — `unknown` at the seam, never inside a board.
 *
 * ⚠️ **No `import.meta.env` here.** The hub's dev server proxies `/api` → the backend while production
 * serves the API at the same origin's root, which `ui/src` knew via Vite's `import.meta.env.PROD`. That
 * is a *bundler* feature: baked into a published `dist/`, it is at best fragile and at worst wrong for
 * whoever installs it. So the base URL is **injected by the host** at boot (`configureTransport`) and
 * everything here goes through `apiUrl()`. A game never calls `configureTransport` — the hub does.
 */

/** Where the platform API lives, relative to the page. Empty (same origin) until the host says otherwise. */
let base = '';

export interface TransportOptions {
  /**
   * Prefix for every platform API path — `''` when the backend serves the UI, `'/api'` behind a dev
   * proxy. No trailing slash; paths passed to `apiUrl` start with `/`.
   */
  readonly baseUrl: string;
}

/**
 * Point the game-facing REST helpers at this host's API. **The host calls this once at boot**, before
 * anything renders (`ui/src/main.tsx`); a game package must never call it.
 */
export function configureTransport({ baseUrl }: TransportOptions): void {
  base = baseUrl;
}

/** Absolute-from-origin URL for a platform API path (`/games/:id/…`), honouring the configured base. */
export function apiUrl(path: string): string {
  return `${base}${path}`;
}

/** The one header every JSON POST here sends. Exported so a game's own routes stay consistent. */
export const JSON_HEADERS = { 'content-type': 'application/json' };

interface ApiError {
  error?: { code?: string; message?: string };
}

/** Throw an Error carrying the server's message (used for any non-2xx response). */
export async function fail(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  throw new Error(body.error?.message ?? `Request failed (${response.status})`);
}

/**
 * Turn a state-returning response into a `GamePayload<S>`, defaulting the fields a lean server reply may
 * omit. The server sends a per-viewer projection (opponents' secret cards are redacted), so what comes
 * back is already only what this client may see.
 */
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

/**
 * Fetch a game's current state by id. `viewer` is a comma-separated list of your seat ids (see only
 * those seats' hidden info); `''` is a spectator (no cards); omit it to follow the active player.
 */
export async function getGame<S = unknown>(gameId: string, viewer?: string): Promise<GamePayload<S>> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap<S>(await fetch(apiUrl(`/games/${gameId}${query}`)));
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
  const response = await fetch(apiUrl(`/games/${gameId}/actions${query}`), {
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
