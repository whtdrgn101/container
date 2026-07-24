import type { RussianRailroadsState } from '../core';

/**
 * Turn-order track helpers (pp. 16–17, RR6). Pure functions over the track (seat indices, leftmost first)
 * and the round's claims — the round-end rearrangement and the between-round worker-reuse queue.
 */

/** This round's claims: which seat placed under first / second place (pg. 16), either possibly `null`. */
export type Claims = RussianRailroadsState['turnClaims'];

/**
 * Rearrange the turn-order track for next round (pg. 16–17): the claimants move to the **front** — the
 * first-place claimant to position 0, the second-place claimant to position 1 — and the remaining pawns
 * shift back, preserving their order. This one formula also yields the pg. 17 **special case** for free: if
 * the current first player claims *second* and nobody claims first, the claimant is already at the front, so
 * the order is unchanged.
 */
export function rearrangeTurnOrder(turnOrder: readonly number[], claims: Claims): number[] {
  const front = [claims.first, claims.second].filter((s): s is number => s !== null);
  const rest = turnOrder.filter((seat) => !front.includes(seat));
  return [...front, ...rest];
}

/**
 * The between-round worker-**reuse** queue (pg. 17): the seats that claimed a turn-order space, in the order
 * they act — the **second-place** claimant first, then the **first-place** claimant. Empty when nobody
 * claimed (so no mini-phase runs).
 */
export function reuseQueue(claims: Claims): number[] {
  return [claims.second, claims.first].filter((s): s is number => s !== null);
}
