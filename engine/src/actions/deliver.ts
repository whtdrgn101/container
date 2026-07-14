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
 * Delivery auction (rulebook pg. 15). The deliverer's ship is at Container Island carrying cargo.
 * Opponents secretly bid cash (`bids`, keyed by player id; a missing/`$0` bid is a legal bluff). The
 * highest bidder wins: they pay their bid and take every container into their scoring area, while the
 * deliverer collects the bid PLUS a matching government subsidy from the supply (double the bid). The
 * turn then ends immediately.
 *
 * Deferred (Slice 5 seam / Slice 6): the buyout option, runoff auctions for ties (broken here by seat
 * order), and the physical $0 bluff-card hand.
 */
export function deliver(state: GameState, delivererId: string, bids: Readonly<Record<string, number>>): GameState {
  const seat = seatOf(state, delivererId);
  const deliverer = state.players[seat]!;

  if (deliverer.ship.location.kind !== 'island' || deliverer.ship.cargo.length === 0) {
    throw new GameError('INVALID_DELIVERY', 'A delivery happens at Container Island with cargo aboard');
  }
  const cargo = deliverer.ship.cargo;

  // Highest bid wins; ties fall to the earliest seat (runoff deferred). Opponents only.
  let winnerId = '';
  let winningBid = -1;
  for (const opponent of state.players) {
    if (opponent.id === delivererId) {
      continue;
    }
    const bid = bids[opponent.id] ?? 0;
    if (bid < 0) {
      throw new GameError('INVALID_SELECTION', 'Bids cannot be negative');
    }
    if (bid > opponent.money) {
      throw new GameError('INSUFFICIENT_FUNDS', `Player "${opponent.id}" cannot bid $${bid}`);
    }
    if (bid > winningBid) {
      winningBid = bid;
      winnerId = opponent.id;
    }
  }

  const players = state.players.map((player): PlayerState => {
    if (player.id === delivererId) {
      // Bid + matching government subsidy from the supply = double the winning bid.
      return { ...player, money: player.money + winningBid * 2, ship: { ...player.ship, cargo: [] } };
    }
    if (player.id === winnerId) {
      return { ...player, money: player.money - winningBid, scoringArea: [...player.scoringArea, ...cargo] };
    }
    return player;
  });

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
    { winnerId, winningBid, containers: [...cargo] },
  );
}
