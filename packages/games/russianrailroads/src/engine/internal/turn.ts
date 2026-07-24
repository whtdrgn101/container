import type { RussianRailroadsState } from '../core';
import { takeLowestLoco } from './locomotives';
import { nextActiveSeat } from './round';
import { settleSpecials } from './specials';

/**
 * Advance the between-round worker-**reuse** mini-phase (pg. 17) after the head seat finishes its reuse
 * action: drop it from the queue. If seats remain, the next (the 1st-place claimant after the 2nd) is on the
 * clock; when the queue empties, the reuse occupancy is cleared and the new round's placement opens with the
 * rearranged turn-order starting seat.
 */
function advanceReuse(state: RussianRailroadsState, seat: number): Partial<RussianRailroadsState> {
  const queue = state.pendingReuse!.filter((s) => s !== seat);
  if (queue.length > 0) return { pendingReuse: queue, activePlayerIndex: queue[0]! };
  return { pendingReuse: null, actionSpaces: {}, activePlayerIndex: state.turnOrder[0]! };
}

/**
 * Advance the game-start **starting-bonus** setup mini-phase (pg. 6) after the head seat resolves its card:
 * drop it from the queue. When the queue empties, round 1's placement opens with the turn-order starting seat.
 */
function advanceSetup(state: RussianRailroadsState, seat: number): Partial<RussianRailroadsState> {
  const queue = state.pendingSetupBonus!.filter((s) => s !== seat);
  if (queue.length > 0) return { pendingSetupBonus: queue, activePlayerIndex: queue[0]! };
  return { pendingSetupBonus: null, activePlayerIndex: state.turnOrder[0]! };
}

/**
 * End one resolution step and decide who acts next — the single continuation every mechanic funnels through
 * (RR6). Given a state whose active seat's board is already updated, it:
 *
 *  1. **settles player-board specials** (pp. 18–19): fires choiceless new-worker grants, and — at a key /
 *     idea-token space (or the industry idea space) — opens that choice lock and **holds the turn**;
 *  2. **holds for the action pool** (pg. 13) if credits remain;
 *  3. otherwise **advances the context**: the reuse mini-phase, the setup mini-phase, or — in a normal round
 *     — passes to the next un-passed seat (`nextActiveSeat`).
 *
 * Returns the state changes to fold into the mechanic's `record()`.
 */
export function continueTurn(state: RussianRailroadsState, seat: number): Partial<RussianRailroadsState> {
  const settle = settleSpecials(state, seat);
  const base: Partial<RussianRailroadsState> = { players: settle.players, ...settle.changes };
  if (settle.held) return base; // a key / idea-token choice holds the turn with this seat
  // The settled board (locks are irrelevant to who acts next; only players / phase queues are read).
  const settled: RussianRailroadsState = { ...state, players: settle.players };
  if (settle.players[seat]!.actionPool.length > 0) return base; // pool credits keep the turn (pg. 13)
  if (settled.pendingReuse) return { ...base, ...advanceReuse(settled, seat) };
  if (settled.pendingSetupBonus) return { ...base, ...advanceSetup(settled, seat) };
  return { ...base, activePlayerIndex: nextActiveSeat(settled)! };
}

/**
 * Decide what happens after a locomotive **or** factory build finishes (pg. 11–13), given `state` already
 * carrying the updated player + drawn-down supply. Handles the 3-worker "loco **and** factory" ordering
 * (pg. 12) via `pendingThen`:
 *
 *  - `pendingThen === 'factory'` (a loco step just finished, factory owed next): open the pending-factory
 *    lock, keep the turn.
 *  - `pendingThen === 'loco'` (a factory step just finished, loco owed next): take the lowest locomotive now,
 *    open the pending-loco lock, keep the turn.
 *  - otherwise: clear both locks and hand off via `continueTurn` (specials, pool, phase or the next seat).
 *
 * Returns the complete state changes to fold into the mechanic's `record()`.
 */
export function afterBuild(state: RussianRailroadsState, seat: number): Partial<RussianRailroadsState> {
  if (state.pendingThen === 'factory') {
    return {
      players: state.players,
      supplies: state.supplies,
      pendingLoco: null,
      pendingFactory: { owed: true },
      pendingThen: null,
    };
  }
  if (state.pendingThen === 'loco') {
    const drawn = takeLowestLoco(state.supplies.locomotives);
    return {
      players: state.players,
      supplies: { ...state.supplies, locomotives: drawn.supply },
      pendingFactory: null,
      pendingLoco: { number: drawn.number },
      pendingThen: null,
    };
  }
  return { supplies: state.supplies, pendingLoco: null, pendingFactory: null, pendingThen: null, ...continueTurn(state, seat) };
}
