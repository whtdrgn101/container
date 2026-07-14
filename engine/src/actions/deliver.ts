import { ACTIONS_PER_TURN, GameError } from '../core';
import type { GameState, PlayerState } from '../core';
import { record, seatOf } from '../internal';

/**
 * True when the active player's ship is at Container Island carrying cargo — they must immediately
 * resolve a delivery auction and may take no other action until they do (rulebook pg. 11, 15).
 */
export function mustDeliver(state: GameState): boolean {
  const active = state.players[state.activePlayerIndex]!;
  return active.ship.location.kind === 'island' && active.ship.cargo.length > 0;
}

/**
 * Delivery auction (rulebook pg. 15–16). The deliverer's ship is at Container Island carrying cargo.
 * Opponents secretly bid cash (`bids`, keyed by player id; a missing/`$0` bid is a legal bluff).
 *
 *  - **Highest bid wins**: the winner pays their bid and takes every container into their scoring
 *    area, while the deliverer collects the bid PLUS a matching government subsidy (double the bid).
 *  - **Ties** trigger a **runoff**: tied players add cash via `runoffBids`; the highest *total* wins
 *    (a still-tie falls to the earliest seat — the rulebook's "deliverer chooses" is simplified).
 *  - **Buyout** (`buyout: true`): the deliverer declines the offer, pays the winning bid to the
 *    supply (→ the Off-Shore Bank in Slice 6), keeps the containers themselves, and gets NO subsidy.
 *
 * The turn ends immediately either way.
 */
export function deliver(
  state: GameState,
  delivererId: string,
  bids: Readonly<Record<string, number>>,
  runoffBids: Readonly<Record<string, number>> = {},
  buyout = false,
): GameState {
  const seat = seatOf(state, delivererId);
  const deliverer = state.players[seat]!;

  if (deliverer.ship.location.kind !== 'island' || deliverer.ship.cargo.length === 0) {
    throw new GameError('INVALID_DELIVERY', 'A delivery happens at Container Island with cargo aboard');
  }
  const cargo = deliverer.ship.cargo;
  const opponents = state.players.filter((player) => player.id !== delivererId);

  // Validate initial bids and find the highest.
  let maxInitial = 0;
  for (const opponent of opponents) {
    const bid = bids[opponent.id] ?? 0;
    if (bid < 0) {
      throw new GameError('INVALID_SELECTION', 'Bids cannot be negative');
    }
    if (bid > opponent.money) {
      throw new GameError('INSUFFICIENT_FUNDS', `Player "${opponent.id}" cannot bid $${bid}`);
    }
    if (bid > maxInitial) {
      maxInitial = bid;
    }
  }

  const tied = opponents.filter((opponent) => (bids[opponent.id] ?? 0) === maxInitial);

  let winner: PlayerState;
  let winningBid: number;
  if (tied.length === 1) {
    winner = tied[0]!;
    winningBid = maxInitial;
  } else {
    // Runoff: tied players add cash; highest total (initial + runoff) wins, still-tie → earliest seat.
    let bestTotal = -1;
    let runoffWinner = tied[0]!;
    for (const opponent of tied) {
      const extra = runoffBids[opponent.id] ?? 0;
      if (extra < 0) {
        throw new GameError('INVALID_SELECTION', 'Runoff bids cannot be negative');
      }
      const total = (bids[opponent.id] ?? 0) + extra;
      if (total > opponent.money) {
        throw new GameError('INSUFFICIENT_FUNDS', `Player "${opponent.id}" cannot bid $${total}`);
      }
      if (total > bestTotal) {
        bestTotal = total;
        runoffWinner = opponent;
      }
    }
    winner = runoffWinner;
    winningBid = bestTotal;
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
    scoringWinnerId = winner.id;
    players = state.players.map((player) => {
      if (player.id === delivererId) {
        // Bid + matching government subsidy from the supply = double the winning bid.
        return { ...player, money: player.money + winningBid * 2, ship: { ...player.ship, cargo: [] } };
      }
      if (player.id === winner.id) {
        return { ...player, money: player.money - winningBid, scoringArea: [...player.scoringArea, ...cargo] };
      }
      return player;
    });
  }

  return record(
    state,
    players,
    'DELIVER',
    delivererId,
    {
      activePlayerIndex: (state.activePlayerIndex + 1) % state.players.length,
      actionsRemaining: ACTIONS_PER_TURN,
      turn: state.turn + 1,
    },
    { winnerId: scoringWinnerId, winningBid, buyout, containers: [...cargo] },
  );
}
