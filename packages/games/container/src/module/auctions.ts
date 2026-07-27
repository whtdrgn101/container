import { deliveryOutcome, mustDeliver } from '../engine';
import type { Color, GameState } from '../engine';
import type { Db } from './context';

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
   * `runoff`  — the leaders tied, so they secretly add cash without taking back their first bid (pg. 16).
   * `decision` — every bid is in and revealed; the deliverer accepts the high bid or buys out.
   */
  readonly phase: 'bidding' | 'runoff' | 'decision';
  /** Sealed cash bids by player id. SECRET while `phase === 'bidding'`. */
  readonly bids: Readonly<Record<string, number>>;
  /** Extra cash added by tied players in a runoff. SECRET while `phase === 'runoff'`. */
  readonly runoffBids: Readonly<Record<string, number>>;
}

/** What a *client* is allowed to know about an auction. Never carries another player's sealed bid. */
export interface DeliveryAuctionView {
  readonly gameId: string;
  readonly delivererId: string;
  readonly cargo: readonly Color[];
  readonly phase: 'bidding' | 'runoff' | 'decision';
  /**
   * The seats that owe a bid **this round**, and whether they've placed it. In a runoff that's only
   * the tied players. The amount stays hidden until the round's reveal.
   */
  readonly bidders: readonly { readonly playerId: string; readonly hasBid: boolean }[];
  /** The viewer's own bid for the current round. You may always see what you yourself bid. */
  readonly yourBid: number | null;
  /**
   * The opening bids, revealed. `null` during `bidding` — populated only once every opponent has
   * committed, which is what makes the bids simultaneous rather than a turn order advantage (pg. 15:
   * "All opponents reveal their bids"). Stays visible through the runoff, per pg. 16.
   */
  readonly revealed: Readonly<Record<string, number>> | null;
  /** The extra cash tied players added, revealed once the runoff closes. */
  readonly runoffRevealed: Readonly<Record<string, number>> | null;
  /** The winning amount once known, else `null`. In a runoff this is the winning *total*. */
  readonly winningBid: number | null;
  /**
   * Bidders the deliverer must choose between — non-empty only when a runoff ended still level and
   * the cargo is going to someone (pg. 16). A buyout needs no choice.
   */
  readonly choiceRequired: readonly string[];
}

/** The seats that owe a bid: everyone except the deliverer (pg. 15, "Each of your opponents"). */
export const biddersFor = (state: GameState, delivererId: string): string[] =>
  state.players.filter((player) => player.id !== delivererId).map((player) => player.id);

/** True once every opponent has committed a sealed bid. */
export const allBidsIn = (auction: DeliveryAuction, state: GameState): boolean =>
  biddersFor(state, auction.delivererId).every((id) => auction.bids[id] !== undefined);

/**
 * The opening bids that tied for the lead — who bids again in a runoff (pg. 16). More than one means
 * a runoff is needed, including when everyone bluffs $0, since they all tie for the highest bid.
 *
 * Asks the engine rather than re-deriving it: the tie rule is a *rule*, and a second copy here would
 * be free to drift out of step with what `deliver` actually does.
 */
export function tiedForLead(auction: DeliveryAuction, state: GameState): string[] {
  const { finalists } = deliveryOutcome(state, auction.delivererId, auction.bids);
  return [...finalists];
}

/** True once every tied player has added their runoff cash. */
export const allRunoffBidsIn = (auction: DeliveryAuction, state: GameState): boolean =>
  tiedForLead(auction, state).every((id) => auction.runoffBids[id] !== undefined);

/** The winning amount and who is still level on it, once the runoff (if any) has been bid out. */
export const outcomeOf = (auction: DeliveryAuction, state: GameState) =>
  deliveryOutcome(state, auction.delivererId, auction.bids, auction.runoffBids);

/** The highest opening bid. A $0 bluff is a legal bid, so this floors at 0, never `-Infinity`. */
export const winningBidOf = (auction: DeliveryAuction): number => Math.max(0, ...Object.values(auction.bids));

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
    runoffBids: {},
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
export function auctionViewFor(auction: DeliveryAuction, state: GameState, viewer: string | null): DeliveryAuctionView {
  // The opening bids are public from the moment they all land (pg. 15) and stay so through a
  // runoff — the tied players are meant to add cash *knowing* what they're level on.
  const openingRevealed = auction.phase !== 'bidding';
  const settled = auction.phase === 'decision';
  const inRunoff = auction.phase === 'runoff';

  // Who owes a bid right now: everyone at first, only the tied players once a runoff starts.
  const owing = inRunoff ? tiedForLead(auction, state) : biddersFor(state, auction.delivererId);
  const round = inRunoff ? auction.runoffBids : auction.bids;

  const { winningBid, finalists } = settled
    ? outcomeOf(auction, state)
    : { winningBid: 0, finalists: [] as readonly string[] };

  return {
    gameId: auction.gameId,
    delivererId: auction.delivererId,
    cargo: auction.cargo,
    phase: auction.phase,
    bidders: owing.map((playerId) => ({ playerId, hasBid: round[playerId] !== undefined })),
    yourBid: viewer !== null ? (round[viewer] ?? null) : null,
    revealed: openingRevealed ? { ...auction.bids } : null,
    runoffRevealed: settled && Object.keys(auction.runoffBids).length > 0 ? { ...auction.runoffBids } : null,
    winningBid: settled ? winningBid : null,
    // Only a real deadlock needs the deliverer's ruling; one finalist decides itself.
    choiceRequired: settled && finalists.length > 1 ? [...finalists] : [],
  };
}

/** Either the auction that results from a bid, or why it was refused. */
export type BidOutcome =
  | { readonly ok: true; readonly auction: DeliveryAuction }
  | { readonly ok: false; readonly code: string; readonly message: string };

/**
 * Place one seat's bid and advance the phase machine — the single implementation of "what a bid
 * means", shared by the REST route and the `BotRunner`. A bot bids through exactly the same rules a
 * human does, including the affordability check, so a bot can't do anything a player couldn't.
 *
 * Pure: returns the next auction rather than saving it, so the caller owns persistence.
 */
export function applyBid(auction: DeliveryAuction, state: GameState, playerId: string, bid: number): BidOutcome {
  if (auction.phase === 'decision') {
    return { ok: false, code: 'BIDDING_CLOSED', message: 'Every bid is already in' };
  }

  const inRunoff = auction.phase === 'runoff';
  // In a runoff only the tied players bid again (pg. 16); everyone else is out.
  const owing = inRunoff ? tiedForLead(auction, state) : biddersFor(state, auction.delivererId);
  if (!owing.includes(playerId)) {
    return {
      ok: false,
      code: 'NOT_A_BIDDER',
      message: inRunoff
        ? `Player "${playerId}" is not tied for the lead and does not bid in the runoff`
        : `Player "${playerId}" is not bidding in this auction`,
    };
  }

  const round = inRunoff ? auction.runoffBids : auction.bids;
  if (round[playerId] !== undefined) {
    // Bids go facedown and stay there (pg. 15) — no taking one back once committed.
    return { ok: false, code: 'ALREADY_BID', message: `Player "${playerId}" has already bid` };
  }

  const bidder = state.players.find((player) => player.id === playerId);
  if (!bidder) {
    return { ok: false, code: 'NOT_A_BIDDER', message: `Player "${playerId}" is not in this game` };
  }
  // A runoff bid is *added* to the opening bid without taking it back, so it's the total that has to
  // be affordable (pg. 16).
  const committed = inRunoff ? (auction.bids[playerId] ?? 0) + bid : bid;
  if (committed > bidder.money) {
    return { ok: false, code: 'INSUFFICIENT_FUNDS', message: `Player "${playerId}" cannot bid $${committed}` };
  }

  // The reveal is what makes the bids simultaneous: nobody's amount is visible until the last
  // opponent has committed, so bidding early costs you nothing and bidding late tells you nothing.
  if (inRunoff) {
    let next: DeliveryAuction = { ...auction, runoffBids: { ...auction.runoffBids, [playerId]: bid } };
    if (allRunoffBidsIn(next, state)) next = { ...next, phase: 'decision' };
    return { ok: true, auction: next };
  }

  let next: DeliveryAuction = { ...auction, bids: { ...auction.bids, [playerId]: bid } };
  if (allBidsIn(next, state)) {
    // Level at the top → a runoff decides it; otherwise straight to the deliverer.
    next = { ...next, phase: tiedForLead(next, state).length > 1 ? 'runoff' : 'decision' };
  }
  return { ok: true, auction: next };
}

interface AuctionRow {
  data: string;
}

/** Persistence for pending auctions. Mirrors LobbyRepository: a JSON snapshot keyed by game id. */
export class AuctionRepository {
  constructor(private readonly db: Db) {}

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
      AuctionRow | undefined;
    return row ? (JSON.parse(row.data) as DeliveryAuction) : undefined;
  }

  /** Discard a resolved auction. The engine state is the record of what happened. */
  clear(gameId: string): void {
    this.db.prepare(`DELETE FROM delivery_auctions WHERE game_id = ?`).run(gameId);
  }
}

/**
 * Keep the pending auction in step with the game: open one whenever a ship is at Container Island
 * with cargo, and make sure none lingers otherwise. The engine owns the rule (`auctionIsDue` →
 * `mustDeliver`); this only mirrors it.
 *
 * Called on **read as well as write**, deliberately. Deriving the auction from the game state rather
 * than trusting a row to have been written makes it self-healing: a game that reached the island
 * before this feature shipped (a live game mid-upgrade) or any state restored without an auction row
 * would otherwise wedge at the island forever, with no way to resolve the delivery.
 */
export function syncAuction(auctions: AuctionRepository, state: GameState): DeliveryAuction | null {
  if (!auctionIsDue(state)) {
    if (auctions.get(state.id)) auctions.clear(state.id);
    return null;
  }
  const active = state.players[state.activePlayerIndex]!;
  const existing = auctions.get(state.id);
  if (existing && existing.delivererId === active.id) return existing;
  const fresh = openAuctionFor(state);
  auctions.save(fresh);
  return fresh;
}
