import type { Action, GameView } from '../engine';
import { BASE_URL, JSON_HEADERS, applyAction, fail, getGame, unwrap } from '@/lib/api';
import type { GamePayload } from '@/lib/api';

/**
 * Container's own API client — the endpoints only this game has.
 *
 * The platform's client (`lib/api.ts`) owns `/games`, `/games/:id`, `/actions` and the stream; a
 * game's own routes live under `/games/:id/<gameType>/…` (roadmap C1). The delivery auction is
 * Container's, not something every game has, so it lives here.
 *
 * This file is also where Container's **types** re-enter: `lib/api.ts` is generic and hands out
 * `unknown` states, and these wrappers pin them back to `GameView`/`Action` so the board is fully
 * typed. That's the deal — `unknown` at the seam, never inside a board.
 */

/** The game type id this client speaks. Matches the backend module's `id`. */
export const GAME_TYPE = 'container';

/** A Container game payload, with its state pinned to Container's view. */
export type ContainerPayload = GamePayload<GameView>;

const route = (gameId: string, path: string) => `${BASE_URL}/games/${gameId}/${GAME_TYPE}${path}`;

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

/** The `type: 'auction'` frame the server pushes down the shared game socket. */
export interface AuctionPush {
  type: 'auction';
  auction: DeliveryAuctionView | null;
}

/** Narrow a side-channel push from the shell's socket to Container's auction frame. */
export const isAuctionPush = (message: { type: string }): message is AuctionPush => message.type === 'auction';

/**
 * Apply a Container action, typed. Thin wrapper over the platform's opaque-action route.
 *
 * `expectedVersion` is the acting view's version, threaded to the optimistic-concurrency guard
 * (REVIEW §4.2) so a double-click resolves to "the board caught up" rather than a double-apply.
 */
export const act = (
  gameId: string,
  playerId: string,
  action: Action,
  viewer?: string,
  expectedVersion?: number,
): Promise<ContainerPayload> => applyAction<GameView>(gameId, playerId, action, viewer, expectedVersion);

/** Re-read a Container game, typed. */
export const getGameAs = (gameId: string, viewer?: string): Promise<ContainerPayload> =>
  getGame<GameView>(gameId, viewer);

/**
 * Fetch the open delivery auction, as seen by one `viewer` seat, or `null` if none is open.
 *
 * `viewer` is a *single* seat, not a list: bids are per-player, so a hotseat client holding every
 * seat asks once per player as it prompts them.
 */
export async function getAuction(gameId: string, viewer?: string): Promise<DeliveryAuctionView | null> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  const response = await fetch(route(gameId, `/auction${query}`));
  if (!response.ok) await fail(response);
  return ((await response.json()) as { auction: DeliveryAuctionView | null }).auction;
}

/** Place one seat's sealed bid. $0 is a legal bluff. Returns the auction as that bidder sees it. */
export async function placeBid(gameId: string, playerId: string, bid: number): Promise<DeliveryAuctionView> {
  const response = await fetch(route(gameId, '/auction/bids'), {
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
): Promise<ContainerPayload> {
  const query = viewer !== undefined ? `?viewer=${encodeURIComponent(viewer)}` : '';
  return unwrap<GameView>(
    await fetch(route(gameId, `/auction/resolve${query}`), {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ playerId, buyout, ...(winnerId ? { winnerId } : {}) }),
    }),
  );
}
