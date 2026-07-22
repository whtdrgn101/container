import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import { applyAction, legalActions } from '../actions';
import type { StPetersburgState } from '../core';

/**
 * A cheap, high-value invariant sweep (roadmap SP7, item 5): drive seeded full games choosing only
 * legal moves, and at **every** step assert that *every* action `legalActions` offers actually applies
 * without throwing. This is the honest check that `legalActions` never advertises a move `applyAction`
 * would reject — the two are derived independently (one enumerates, one validates), so a drift between
 * them (a mis-costed trading buy, an over-limit hand add, a stale slot) shows up here as a thrown
 * `GameError` rather than as a UI button that 409s or a bot that picks an illegal move.
 *
 * It also confirms the end-to-end health of a real game: version strictly increases per applied action,
 * the move log grows in lock-step, and the game actually reaches `ended` (the SP6 trigger fires from
 * live board deals, not just hand-set flags).
 */

/** mulberry32 — a small deterministic PRNG so each seed reproduces an entire game (deck + choices). */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Ann', 'Bob', 'Cid', 'Dee'];

/** Play one seeded game to its end, asserting the legalActions⊆applyAction invariant at each step. */
function fuzzGame(playerCount: number, seed: number): { steps: number; ended: boolean } {
  const rng = makeRng(seed);
  let state = createGame({ id: `fuzz-${playerCount}-${seed}`, players: NAMES.slice(0, playerCount).map((name) => ({ name })), rng });
  const active = () => state.players[state.activePlayerIndex]!.id;

  let steps = 0;
  const MAX_STEPS = 6000;
  for (; steps < MAX_STEPS && state.status === 'active'; steps += 1) {
    const seat = active();
    const options = legalActions(state, seat);
    // Saint Petersburg always has at least PASS available on your turn (or a forced interlude resolve).
    expect(options.length).toBeGreaterThan(0);

    // Every offered action must apply cleanly against the *current* state (independent copies).
    for (const option of options) {
      expect(() => applyAction(state, seat, option)).not.toThrow();
    }

    // Advance with one of them (rng-picked so the walk is deterministic per seed), and assert the
    // bookkeeping: exactly one version bump and one new log entry per applied action.
    const choice = options[Math.floor(rng() * options.length)]!;
    const beforeVersion = state.version;
    const beforeLog = state.log.length;
    const next = applyAction(state, seat, choice);
    expect(next.version).toBe(beforeVersion + 1);
    expect(next.log.length).toBe(beforeLog + 1);
    state = next;
  }

  return { steps, ended: state.status === 'ended' };
}

describe('Saint Petersburg — legalActions/applyAction fuzz (SP7)', () => {
  // A spread of seeds per player count, each a full game. Different seeds shuffle the four stacks
  // differently, so across the set the walk exercises buys (both rows), hand adds/plays, trading-card
  // displacement, and the Pub/Observatory interludes — anything legalActions can offer is applied.
  for (const playerCount of [2, 3, 4]) {
    for (const seed of [1, 7, 42, 20260722, 999983]) {
      it(`${playerCount}p / seed ${seed}: every legal action applies, and the game ends`, () => {
        const { steps, ended } = fuzzGame(playerCount, seed);
        expect(steps).toBeLessThan(6000); // it terminated well within the cap
        expect(ended).toBe(true); // the SP6 end trigger fired from real board deals
      });
    }
  }
});
