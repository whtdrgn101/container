/**
 * Transport-security helpers (REVIEW §4.7). The no-auth choice is deliberate (trusted-LAN use); these
 * are orthogonal hardening: they stop an *unrelated* page or a runaway client from abusing the socket,
 * not an authenticated user from doing what they're allowed to.
 *
 * Kept as small, pure/stateful units here (rather than inline in `app.ts`) so each is unit-testable in
 * isolation — the WS upgrade path is awkward to exercise through `injectWS`, so the predicate and the
 * per-IP cap earn their coverage directly.
 */

/** Generous global per-IP rate limit (`@fastify/rate-limit`). 300/min leaves headroom over the 3s poll. */
export const DEFAULT_RATE_LIMIT = { max: 300, timeWindow: 60_000 } as const;

/** Max concurrent live-stream sockets from one IP. A tab opens one; 32 is far above any honest client. */
export const WS_MAX_CONNECTIONS_PER_IP = 32;

/**
 * Max inbound WS frame size. The socket is **push-only** — a client legitimately sends nothing beyond
 * ws-level pings — so a tiny cap is right, and a bigger frame is a misbehaving or hostile peer.
 */
export const WS_MAX_PAYLOAD = 1024;

/**
 * How often the hub pings each live-stream socket to reap half-open ones (REVIEW §4.7). A socket that
 * misses a whole interval's ping/pong round-trip is terminated on the next sweep — so a dead peer is
 * gone within one-to-two intervals, freeing its per-IP slot. 30s matches the compose healthcheck
 * cadence: frequent enough to bound the `rooms` map, cheap enough to be invisible.
 */
export const WS_HEARTBEAT_INTERVAL_MS = 30_000;

/** Longest accepted display name / game-type string, on every body that takes one (input-bound §4.7). */
export const MAX_NAME_LENGTH = 64;

/**
 * Longest accepted chat message body (input-bound §4.7). Chat is stored append-only and echoed to every
 * viewer, so an unbounded body would be a storage/broadcast amplifier — a generous line of text, capped.
 */
export const MAX_CHAT_LENGTH = 500;

/**
 * How many past chat messages a resuming client is backfilled with over the socket. Chat is table-public
 * and append-only; a joiner sees the recent tail rather than the whole history, so a long-running game's
 * log can't grow the resume payload without bound.
 */
export const CHAT_BACKFILL_LIMIT = 100;

/** Longest accepted `gameType` id. */
export const MAX_GAME_TYPE_LENGTH = 64;

/** Upper bound on the `players` array of `POST /games` — above any module's `maxPlayers` (7 today, Argute). */
export const MAX_SEATS = 8;

/** Explicit Fastify `bodyLimit`. Actions are tiny; 256 KiB is generous and caps a hostile body. */
export const BODY_LIMIT_BYTES = 256 * 1024;

/**
 * May a WebSocket upgrade proceed, given its `Origin` and `Host` headers?
 *
 * WS is **exempt from CORS**, so without this any page a LAN user happens to visit could open
 * `/games/:id/stream` and read that user's projected game state. We allow:
 *
 * - **No `Origin`** — a non-browser client (the test `injectWS`, a CLI, a script). Browsers always send
 *   one on a cross-site request, so an absent Origin is not a browser attacker.
 * - **Same-origin** — the `Origin`'s host equals the request `Host` (the app talking to itself).
 * - **An explicit allowlist** entry — either the full origin (`https://play.lan`) or its bare host,
 *   for a deployment fronted by a different hostname than the socket sees.
 *
 * Anything else is refused. A malformed `Origin` (unparseable) is refused rather than trusted.
 */
export function isAllowedWsOrigin(
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (origin === undefined) return true; // non-browser client (no Origin header)
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // an Origin we can't parse is not one we trust
  }
  if (host !== undefined && originHost === host) return true; // same-origin
  return allowedOrigins.includes(origin) || allowedOrigins.includes(originHost);
}

/**
 * A per-IP concurrent-connection cap for the live stream. Tiny stateful counter, extracted so it can be
 * unit-tested without a real socket. `tryAcquire` returns false once an IP is at the cap; `release` is
 * called on socket close (and drops the key at zero, so the map can't grow without bound).
 */
export class WsConnectionLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly max: number = WS_MAX_CONNECTIONS_PER_IP) {}

  /** Reserve a slot for `ip`; false (and no reservation) if it is already at the cap. */
  tryAcquire(ip: string): boolean {
    const current = this.counts.get(ip) ?? 0;
    if (current >= this.max) return false;
    this.counts.set(ip, current + 1);
    return true;
  }

  /** Release a slot previously acquired for `ip`. Idempotent-safe: never drops below zero. */
  release(ip: string): void {
    const current = this.counts.get(ip) ?? 0;
    if (current <= 1) this.counts.delete(ip);
    else this.counts.set(ip, current - 1);
  }

  /** Live connection count for an IP (diagnostics / tests). */
  countFor(ip: string): number {
    return this.counts.get(ip) ?? 0;
  }
}
