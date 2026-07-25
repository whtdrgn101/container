import type { Engineer, RussianRailroadsPlayer } from '../core';

/**
 * Engineer-strip geometry + majority helpers (pg. 15–16, 22). Pure functions over the strip / a player —
 * no mutation, no randomness — so the 100% gate is reachable and the same code serves the engine, module and
 * (later) the bot. The strip regions are defined **from the right end**, so they hold for both the 7-slot
 * (3/4-player) and 6-slot (2-player) strips (pg. 23): the right-most slot is the hiring space, the two before
 * it the variable action spaces, the rest the left-hand (future) spaces.
 */

/** The strip index of the **hiring space** (pg. 15): the right-most slot. */
export function hiringIndex(strip: readonly (Engineer | null)[]): number {
  return strip.length - 1;
}

/**
 * The strip index of a **variable action space** (pg. 15): the two slots left of the hiring space, `slot` 0
 * (left) or 1 (right, nearer the hiring space).
 */
export function variableIndex(strip: readonly (Engineer | null)[], slot: number): number {
  return strip.length - 3 + slot;
}

/** The engineer currently in the hiring space (pg. 15), or `null` if it is empty. */
export function hiringEngineer(strip: readonly (Engineer | null)[]): Engineer | null {
  return strip[hiringIndex(strip)] ?? null;
}

/** The engineer on variable action `slot` (0/1), or `null` if that space is empty (pg. 15). */
export function variableEngineer(strip: readonly (Engineer | null)[], slot: number): Engineer | null {
  if (slot !== 0 && slot !== 1) return null;
  return strip[variableIndex(strip, slot)] ?? null;
}

/**
 * Take the hiring-space engineer off the strip (pg. 15): return a new strip with the right-most slot emptied.
 * Because it is emptied, the round-end slide (`slideEngineerStrip`) drops a `null` rather than an unclaimed
 * engineer — so a *hired* engineer is never returned to the box, and a second hire the same round finds an
 * empty space (pg. 15: exactly one engineer is hireable per round).
 */
export function takeHiring(strip: readonly (Engineer | null)[]): (Engineer | null)[] {
  return strip.map((slot, i) => (i === hiringIndex(strip) ? null : slot));
}

/** How many engineers a player has hired (pg. 22 majority: most engineers scores 40, second-most 20). */
export function engineerCount(player: RussianRailroadsPlayer): number {
  return player.hiredEngineers.length;
}

/**
 * The highest printed number among a player's hired engineers (pg. 22), or 0 if none. RR8's engineer-majority
 * tiebreak reads it ("the tied player with the highest number on one of their engineers breaks the tie").
 */
export function highestEngineerNumber(player: RussianRailroadsPlayer): number {
  return player.hiredEngineers.reduce((max, e) => (e.number > max ? e.number : max), 0);
}
