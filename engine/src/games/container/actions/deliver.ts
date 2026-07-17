import { GameError } from '../core';
import type { GameState, PlayerState } from '../core';
import { payToBankCash, record, seatOf } from '../internal';
import { advanceTurn } from './loans';

/**
 * True when the active player's ship is at Container Island carrying cargo — they must immediately
 * resolve a delivery auction and may take no other action until they do (rulebook pg. 11, 15).
 */
export function mustDeliver(state: GameState): boolean {
  const active = state.players[state.activePlayerIndex]!;
  return active.ship.location.kind === 'island' && active.ship.cargo.length > 0;
}

/**
 * Everything needed to settle a delivery auction in one atomic move. Mirrors the `DELIVER` action.
 *
 * The bids arrive all at once because the engine has no notion of a half-run auction — collecting
 * sealed bids is the caller's job (see `backend/src/auctions.ts`).
 */
export interface DeliveryResolution {
  /** Each opponent's sealed cash bid, keyed by player id. A missing entry is a legal $0 bluff. */
  readonly bids: Readonly<Record<string, number>>;
  /** Extra cash added by tied players in a runoff (pg. 16). Ignored when there was no tie. */
  readonly runoffBids?: Readonly<Record<string, number>>;
  /** Decline the offer: pay the winning bid to the Bank and keep the containers yourself. */
  readonly buyout?: boolean;
  /**
   * The deliverer's pick when a runoff leaves bidders *still* tied — "the player delivering
   * containers chooses which tied bidder wins" (pg. 16). Required in exactly that case, and rejected
   * otherwise so a caller can't quietly hand the cargo to whomever it likes.
   */
  readonly chosenWinnerId?: string;
}

/** How a set of bids resolves: the price, and who is still level on it. */
export interface DeliveryOutcome {
  /** The winning amount — the top opening bid, or the top *total* once a runoff is settled. */
  readonly winningBid: number;
  /** Bidders level at `winningBid`. More than one means the deliverer must choose (pg. 16). */
  readonly finalists: readonly string[];
}

/**
 * Work out who wins a delivery auction and for how much. Pure and validation-free — just the rule.
 *
 * Exported because *everyone* needs to predict this, not only `deliver`: the backend projects the
 * auction's state to clients from it, and a bot has to know the price before it can decide whether
 * to buy out. Those callers previously each re-derived the tie logic, which is three chances for the
 * rule to drift apart. There is one copy, and it lives here with the rules.
 */
export function deliveryOutcome(
  state: GameState,
  delivererId: string,
  bids: Readonly<Record<string, number>>,
  runoffBids: Readonly<Record<string, number>> = {},
): DeliveryOutcome {
  const opponents = state.players.filter((player) => player.id !== delivererId);
  const opening = (opponent: PlayerState) => bids[opponent.id] ?? 0;

  // A $0 bluff is a real bid, so an all-$0 auction ties for the lead at $0 rather than having none.
  const maxOpening = Math.max(0, ...opponents.map(opening));
  const tied = opponents.filter((opponent) => opening(opponent) === maxOpening);
  if (tied.length === 1) {
    return { winningBid: maxOpening, finalists: [tied[0]!.id] };
  }

  // Tied → a runoff decides it. The extra cash is *added* to the opening bid (pg. 16).
  const total = (opponent: PlayerState) => opening(opponent) + (runoffBids[opponent.id] ?? 0);
  const winningBid = Math.max(0, ...tied.map(total));
  return { winningBid, finalists: tied.filter((opponent) => total(opponent) === winningBid).map((o) => o.id) };
}

/**
 * Delivery auction (rulebook pg. 15–16). The deliverer's ship is at Container Island carrying cargo.
 * Opponents secretly bid cash (`bids`, keyed by player id; a missing/`$0` bid is a legal bluff).
 *
 *  - **Highest bid wins**: the winner pays their bid and takes every container into their scoring
 *    area, while the deliverer collects the bid PLUS a matching government subsidy (double the bid).
 *  - **Ties** trigger a **runoff** (pg. 16): tied players add cash via `runoffBids` without taking
 *    back their initial bid, and the highest *total* wins. If they are **still** tied, the deliverer
 *    picks the winner via `chosenWinnerId`.
 *  - **Buyout** (`buyout: true`): the deliverer declines the offer, pays the winning bid to the
 *    Off-Shore Bank, keeps the containers themselves, and gets NO subsidy. On a still-tied runoff no
 *    choice is needed — every tied bidder simply takes their bid back.
 *
 * The turn ends immediately either way.
 */
export function deliver(state: GameState, delivererId: string, resolution: DeliveryResolution): GameState {
  const { bids, runoffBids = {}, buyout = false, chosenWinnerId } = resolution;
  const seat = seatOf(state, delivererId);
  const deliverer = state.players[seat]!;

  if (deliverer.ship.location.kind !== 'island' || deliverer.ship.cargo.length === 0) {
    throw new GameError('INVALID_DELIVERY', 'A delivery happens at Container Island with cargo aboard');
  }
  const cargo = deliverer.ship.cargo;
  const opponents = state.players.filter((player) => player.id !== delivererId);

  // Validate the opening bids.
  for (const opponent of opponents) {
    const bid = bids[opponent.id] ?? 0;
    if (bid < 0) {
      throw new GameError('INVALID_SELECTION', 'Bids cannot be negative');
    }
    if (bid > opponent.money) {
      throw new GameError('INSUFFICIENT_FUNDS', `Player "${opponent.id}" cannot bid $${bid}`);
    }
  }

  // Validate the runoff additions against what each player can actually pay. The extra stacks on top
  // of the opening bid rather than replacing it (pg. 16), so it's the *total* that must be affordable
  // — and the opening bid may well be an unrecorded $0 bluff.
  for (const opponent of opponents) {
    const extra = runoffBids[opponent.id] ?? 0;
    if (extra < 0) {
      throw new GameError('INVALID_SELECTION', 'Runoff bids cannot be negative');
    }
    const total = (bids[opponent.id] ?? 0) + extra;
    if (total > opponent.money) {
      throw new GameError('INSUFFICIENT_FUNDS', `Player "${opponent.id}" cannot bid $${total}`);
    }
  }

  const { winningBid, finalists: finalistIds } = deliveryOutcome(state, delivererId, bids, runoffBids);
  const finalists = opponents.filter((opponent) => finalistIds.includes(opponent.id));

  /*
   * A choice is needed only when a runoff left several bidders level *and* the cargo is actually
   * going to one of them. On a buyout nobody wins it — "If they buy out the auction, all tied
   * bidders return their bids" (pg. 16) — so there is nothing to decide. Offering a choice when
   * none is called for is a caller bug, not a preference, so say so rather than ignore it.
   */
  const needsChoice = !buyout && finalists.length > 1;
  if (chosenWinnerId !== undefined && !needsChoice) {
    throw new GameError('INVALID_SELECTION', 'There is no tie for the deliverer to break');
  }

  let winner: PlayerState | null = null;
  if (!buyout) {
    if (finalists.length === 1) {
      winner = finalists[0]!;
    } else if (chosenWinnerId === undefined) {
      throw new GameError(
        'CHOICE_REQUIRED',
        `The runoff is tied at $${winningBid} — player "${delivererId}" must choose which tied bidder wins`,
      );
    } else {
      winner = finalists.find((opponent) => opponent.id === chosenWinnerId) ?? null;
      if (!winner) {
        throw new GameError('INVALID_SELECTION', `Player "${chosenWinnerId}" is not tied for the highest bid`);
      }
    }
  }

  let players: readonly PlayerState[];
  let scoringWinnerId: string;
  if (buyout) {
    if (deliverer.money < winningBid) {
      throw new GameError('INSUFFICIENT_FUNDS', `Player "${delivererId}" cannot afford the $${winningBid} buyout`);
    }
    scoringWinnerId = delivererId;
    players = state.players.map((player) =>
      player.id === delivererId
        ? { ...player, money: player.money - winningBid, scoringArea: [...player.scoringArea, ...cargo], ship: { ...player.ship, cargo: [] } }
        : player,
    );
  } else {
    // Non-null by construction: `winner` is resolved above for every non-buyout path.
    const takesCargo = winner!;
    scoringWinnerId = takesCargo.id;
    players = state.players.map((player) => {
      if (player.id === delivererId) {
        // Bid + matching government subsidy from the supply = double the winning bid.
        return { ...player, money: player.money + winningBid * 2, ship: { ...player.ship, cargo: [] } };
      }
      if (player.id === takesCargo.id) {
        return { ...player, money: player.money - winningBid, scoringArea: [...player.scoringArea, ...cargo] };
      }
      return player;
    });
  }

  // A buyout pays the winning bid into the Bank's cash lots (rulebook pg. 16).
  const bankAfter = buyout
    ? { ...state.bank, cashLots: payToBankCash(state.bank.cashLots, winningBid) }
    : state.bank;

  const advanced = advanceTurn(state, players, bankAfter);
  return record(state, advanced.players, 'DELIVER', delivererId, advanced.extra, {
    winnerId: scoringWinnerId,
    winningBid,
    buyout,
    containers: [...cargo],
  });
}
