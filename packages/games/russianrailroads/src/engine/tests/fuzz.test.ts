import { describe, expect, it } from 'vitest';
import { createGame } from '../createGame';
import { applyAction, legalActions } from '../actions';
import { makeRng } from './helpers';

/**
 * The `legalActions ⊆ applyAction` invariant sweep (roadmap RR8, the SP7 fuzz pattern). Drive seeded full
 * games choosing only legal moves, and at **every** step assert that *every* action `legalActions` offers
 * applies without throwing. `legalActions` (an enumerator) and `applyAction` (the validator) are derived
 * independently, so any drift — a mis-gated last-round tile, an over-budget move, a stale lock — surfaces
 * here as a thrown `GameError` rather than as a UI button that 409s or a bot that picks an illegal move.
 * This is where the seven-lock design (moves / loco / factory / pool / key / idea-token / idea-card, plus
 * the setup + reuse mini-phases) earns its keep: the enumerator stays exactly in step with the dispatcher.
 *
 * It also confirms end-to-end health: version strictly increases per applied action, the log grows in
 * lock-step, and the game reaches `ended` (the last round scores, then final scoring runs — pg. 22).
 */

const NAMES = ['Ann', 'Bob', 'Cid', 'Dee'];

/** Play one seeded game to its end, asserting the legalActions⊆applyAction invariant at each step. */
function fuzzGame(playerCount: number, seed: number): { steps: number; ended: boolean } {
  const rng = makeRng(seed);
  let state = createGame({
    id: `fuzz-${playerCount}-${seed}`,
    players: NAMES.slice(0, playerCount).map((name) => ({ name })),
    rng,
  });
  const active = () => state.players[state.activePlayerIndex]!.id;

  let steps = 0;
  const MAX_STEPS = 40000;
  for (; steps < MAX_STEPS && state.status === 'active'; steps += 1) {
    const seat = active();
    const options = legalActions(state, seat);
    // There is always at least one legal action for the seat on the clock (PASS, or a forced resolution).
    expect(options.length).toBeGreaterThan(0);

    // Every offered action must apply cleanly against the *current* state (independent copies).
    for (const option of options) {
      expect(() => applyAction(state, seat, option)).not.toThrow();
    }

    // Advance with one of them (rng-picked so the walk is deterministic per seed), asserting the bookkeeping:
    // exactly one version bump and one new log entry per applied action.
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

describe('Russian Railroads — legalActions/applyAction fuzz (RR8)', () => {
  // A spread of seeds per player count, each a full game. Different seeds shuffle the engineer stacks and
  // end-bonus pile differently; across the set the walk exercises the whole locked surface.
  for (const playerCount of [2, 3, 4]) {
    for (const seed of [1, 7, 42, 2718, 20260724]) {
      it(`${playerCount}p / seed ${seed}: every legal action applies, and the game ends`, () => {
        const { steps, ended } = fuzzGame(playerCount, seed);
        expect(steps).toBeLessThan(40000); // it terminated well within the cap
        expect(ended).toBe(true); // the last round scored and final scoring ran (pg. 22)
      });
    }
  }
});
