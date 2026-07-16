import { mustDeliver } from '@container/engine';
import type { Color, GameState } from '@container/engine';
import type { DB } from './db';

/**
 * A pending delivery auction (roadmap A1). Coordination state that lives **outside** the engine, the
 * same way lobbies do — the engine has no notion of a half-finished auction, and must not gain one.
 *
 * It exists because the engine's `DELIVER` is a single atomic action carrying *every* opponent's bid
 * at once (rulebook pg. 15: opponents bid facedown, simultaneously). Someone has to collect those
 * sealed bids before that action can be built, and only the players themselves can supply them. This
 * record is that collection point: the auction opens when a ship docks at Container Island with
 * cargo, each opponent bids from their own device, and once every bid is in the deliverer accepts or
 * buys out — at which point one `DELIVER` goes to the engine and the record is discarded.
 *
 * **`bids` is secret.** It is never sent to a client during the bidding phase; see `auctionViewFor`.
 */
export interface DeliveryAuction {
  /** The game this auction belongs to. One open auction per game, so this is the primary key. */
  readonly gameId: string;
  readonly delivererId: string;
  /** The cargo up for auction. Public — ships are open (pg. 15). */
  readonly cargo: readonly Color[];
  /**
   * `bidding` — opponents are still submitting sealed bids.
   * `decision` — every bid is in and revealed; the deliverer accepts the high bid or buys out.
   */
  readonly phase: 'bidding' | 'decision';
  /** Sealed cash bids by player id. SECRET while `phase === 'bidding'`. */
  readonly bids: Readonly<Record<string, number>>;
}

/** What a *client* is allowed to know about an auction. Never carries another player's sealed bid. */
export interface DeliveryAuctionView {
  readonly gameId: string;
  readonly delivererId: string;
  readonly cargo: readonly Color[];
  readonly phase: 'bidding' | 'decision';
  /** Every seat that must bid, and whether it has — the amount stays hidden until the reveal. */
  readonly bidders: readonly { readonly playerId: string; readonly hasBid: boolean }[];
  /** The viewer's own bid, if they have placed one. You may always see what you yourself bid. */
  readonly yourBid: number | null;
  /**
   * All bids, revealed. `null` during `bidding` — populated only once every opponent has committed,
   * which is what makes the bids simultaneous rather than a turn order advantage (pg. 15: "All
   * opponents reveal their bids").
   */
  readonly revealed: Readonly<Record<string, number>> | null;
  /** The winning amount once revealed, else `null`. */
  readonly winningBid: number | null;
}

/** The seats that owe a bid: everyone except the deliverer (pg. 15, "Each of your opponents"). */
export const biddersFor = (state: GameState, delivererId: string): string[] =>
  state.players.filter((player) => player.id !== delivererId).map((player) => player.id);

/** True once every opponent has committed a sealed bid. */
export const allBidsIn = (auction: DeliveryAuction, state: GameState): boolean =>
  biddersFor(state, auction.delivererId).every((id) => auction.bids[id] !== undefined);

/** The highest bid on the table. A $0 bluff is a legal bid, so this floors at 0, never `-Infinity`. */
export const winningBidOf = (auction: DeliveryAuction): number =>
  Math.max(0, ...Object.values(auction.bids));

/**
 * Should this game have an open auction right now? Delegates the rule to the engine rather than
 * re-deriving "ship at island with cargo" here — that is a rules question, and the engine owns it.
 */
export const auctionIsDue = (state: GameState): boolean => state.status === 'active' && mustDeliver(state);

/** Open a fresh auction for whoever is pinned at the island. */
export function openAuctionFor(state: GameState): DeliveryAuction {
  const deliverer = state.players[state.activePlayerIndex]!;
  return {
    gameId: state.id,
    delivererId: deliverer.id,
    cargo: [...deliverer.ship.cargo],
    phase: 'bidding',
    bids: {},
  };
}

/**
 * Project an auction for one viewer, redacting every bid that is not theirs until the reveal.
 *
 * This is the whole point of routing bids through the server: today the deliverer types everyone's
 * bid on their own screen, so "sealed" bids are visible to the one player they most need to be
 * hidden from — they choose whether to buy out *knowing* the bids. `viewer` may hold several seats
 * (hotseat drives them all), so `yourBid` resolves against the seat currently being asked.
 */
export function auctionViewFor(
  auction: DeliveryAuction,
  state: GameState,
  viewer: string | null,
): DeliveryAuctionView {
  const revealed = auction.phase === 'decision';
  return {
    gameId: auction.gameId,
    delivererId: auction.delivererId,
    cargo: auction.cargo,
    phase: auction.phase,
    bidders: biddersFor(state, auction.delivererId).map((playerId) => ({
      playerId,
      hasBid: auction.bids[playerId] !== undefined,
    })),
    yourBid: viewer !== null ? (auction.bids[viewer] ?? null) : null,
    revealed: revealed ? { ...auction.bids } : null,
    winningBid: revealed ? winningBidOf(auction) : null,
  };
}

interface AuctionRow {
  data: string;
}

/** Persistence for pending auctions. Mirrors LobbyRepository: a JSON snapshot keyed by game id. */
export class AuctionRepository {
  constructor(private readonly db: DB) {}

  /** Insert or replace the open auction for a game (one per game, keyed by `gameId`). */
  save(auction: DeliveryAuction): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO delivery_auctions (game_id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(game_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(auction.gameId, JSON.stringify(auction), now, now);
  }

  get(gameId: string): DeliveryAuction | undefined {
    const row = this.db.prepare(`SELECT data FROM delivery_auctions WHERE game_id = ?`).get(gameId) as
      | AuctionRow
      | undefined;
    return row ? (JSON.parse(row.data) as DeliveryAuction) : undefined;
  }

  /** Discard a resolved auction. The engine state is the record of what happened. */
  clear(gameId: string): void {
    this.db.prepare(`DELETE FROM delivery_auctions WHERE game_id = ?`).run(gameId);
  }
}
