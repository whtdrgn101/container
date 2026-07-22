import { GameError, PUB_MAX_POINTS, PUB_POINT_COST } from '../core';
import type { StPetersburgState } from '../core';
import { advanceAfterScoring, record, seatOf, withPlayer } from '../internal';

/**
 * Buy victory points at the **Pub** (pg. 8, SP5): *immediately after* the building phase scores, each seat
 * owning a Pub may buy **up to 5 points at 2 rubles each** (`points` = 0 declines). This resolves the head
 * of the `pendingPubBuy` queue — the seat on the clock, enforced by `applyAction`'s turn check.
 *
 * Rulings (pg. 8, documented on `internal/specials.ts` + the roadmap):
 *  - **Whole points only** — "the player cannot buy 2 rubles for 1 point": you pay exactly `2 × points`,
 *    never a fraction. `points` is an integer 0–5; anything else is `INVALID_PUB_POINTS`.
 *  - **5 points per player**, not per Pub — owning two Pubs does not raise the cap (`pubOwnerSeats` lists a
 *    seat once). The sheet's "the player can buy up to 5 points" is a per-player cap.
 *
 * When the queue empties, the building phase finally advances (`advanceAfterScoring` — the refill + next
 * phase deferred while the Pub window was open); otherwise the next queued Pub owner comes up.
 */
export function pubBuy(state: StPetersburgState, playerId: string, points: number): StPetersburgState {
  const pending = state.pendingPubBuy;
  if (!pending) {
    throw new GameError('NO_PUB_PENDING', 'No Pub buy-points window is open');
  }
  if (!Number.isInteger(points) || points < 0 || points > PUB_MAX_POINTS) {
    throw new GameError('INVALID_PUB_POINTS', `The Pub buys 0–${PUB_MAX_POINTS} whole points, got ${points}`);
  }

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const cost = points * PUB_POINT_COST;
  if (player.rubles < cost) {
    throw new GameError('INSUFFICIENT_RUBLES', `${points} point(s) cost ${cost} rubles; you have ${player.rubles}`);
  }

  const updated = { ...player, rubles: player.rubles - cost, points: player.points + points };
  const rest = pending.queue.slice(1);
  const players = withPlayer(state, seat, updated);

  // The last Pub owner just resolved → the building phase advances (refill + next phase), which was held
  // open while the window ran. `advanceAfterScoring` reads `state.phase` (still 'building') + the board.
  const tail =
    rest.length === 0
      ? { players, pendingPubBuy: undefined, ...advanceAfterScoring(state) }
      : { players, pendingPubBuy: { queue: rest }, activePlayerIndex: rest[0]! };

  return record(state, 'PUB_BUY', playerId, tail, { points, cost });
}
