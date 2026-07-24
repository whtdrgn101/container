// The turn-order track (rulebook pp. 16–17) + the setup starting-bonus cards (pg. 6). Read the cited page
// before touching a value. RR6 replaces RR1's "dealt order for the whole game" with the real track.
//
// HOW TURN ORDER WORKS (pg. 16): the track holds one pawn per player, left→right = play order (leftmost
// acts first). Round 1's order is the dealt turn-order cards (ascending); every later round's order is the
// **track** left after the previous round's rearrangement. Passing flips your turn-order card and scores
// its reverse (pg. 16); the two action spaces under 1st/2nd place let you claim a better position for next
// round (pg. 16); the round-end rearrangement moves the claimants to the front (pg. 16–17).

/**
 * The two turn-order **claim** action spaces (pg. 16): a worker under **first** place or under **second**
 * place buys that position for next round. The ids are the action-space ids; the ordinal is which track
 * slot the space sits under (0 = first place, 1 = second place).
 */
export const TURN_ORDER_SPACES = {
  first: 'turnorder-1',
  second: 'turnorder-2',
} as const;

/** Is `spaceId` one of the two turn-order claim spaces (pg. 16)? */
export function isTurnOrderSpace(spaceId: string): boolean {
  return spaceId === TURN_ORDER_SPACES.first || spaceId === TURN_ORDER_SPACES.second;
}

/** The track ordinal (0 = first, 1 = second) a turn-order claim space sits under (pg. 16), or −1 if none. */
export function turnOrderOrdinal(spaceId: string): number {
  if (spaceId === TURN_ORDER_SPACES.first) return 0;
  if (spaceId === TURN_ORDER_SPACES.second) return 1;
  return -1;
}

/**
 * The points a player scores when they **pass**, by their dealt turn-order card number (pg. 16: "turn your
 * turn order card over and immediately score any points shown on the reverse").
 *
 * **ART RULING (RR6):** the reverse (pass-scoring) values are **not legibly readable** from the v2 PDF —
 * pg. 5 shows only the numbered *fronts* ("different reverse sides, so shuffle … without looking"), and no
 * page tabulates the backs. Adopting a **documented ADAPTED set** (the END_BONUS_CARDS / turn-order-length
 * precedent): the reverse rewards *later* players (a compensation for a worse round-1 seat), so it increases
 * with the card number — card 1 (first player) scores 0, up by 2 per step. Reconcile against physical cards
 * in RR9 (art polish). A player keeps their dealt card all game, so this is a fixed per-round pass bonus.
 */
export const TURN_ORDER_PASS_POINTS: Readonly<Record<number, number>> = { 1: 0, 2: 2, 3: 4, 4: 6 };

/** The pass-score for a dealt turn-order `card` (pg. 16); unknown cards score 0 (never happens — 1–4 only). */
export function passPoints(card: number): number {
  return TURN_ORDER_PASS_POINTS[card] ?? 0;
}
