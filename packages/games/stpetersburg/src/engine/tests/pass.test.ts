import { describe, expect, it } from 'vitest';
import { pass } from '../actions';
import { makeState, newGame } from './helpers';

describe('pass', () => {
  it('advances the turn and counts the pass when not everyone has passed yet (pg. 3)', () => {
    const before = newGame(['Ann', 'Bob']); // active p1, worker phase
    const after = pass(before, 'p1');
    expect(after.consecutivePasses).toBe(1);
    expect(after.activePlayerIndex).toBe(1); // turn → p2
    expect(after.phase).toBe('worker'); // phase not closed
    expect(after.players[0]!.rubles).toBe(25); // no scoring on a lone pass
    expect(after.log.at(-1)).toMatchObject({ type: 'PASS', playerId: 'p1' });
    expect(before.consecutivePasses).toBe(0); // input untouched
  });

  it('closes the aristocrat phase and hands off to trading (score + refill, pg. 4)', () => {
    // p2 has already passed (consecutivePasses 1); p1's pass closes the aristocrat phase's actions. A card
    // was taken this phase, so the trading refill runs.
    const before = makeState({
      phase: 'aristocrat',
      activePlayerIndex: 0,
      consecutivePasses: 1,
      tookCardThisPhase: true,
    });
    const after = pass(before, 'p1');
    expect(after.phase).toBe('trading');
    expect(after.consecutivePasses).toBe(0);
    // Aristocrat stack drew into the upper row (4 seeded workers + 4 trading refill = 8).
    expect(after.board.upper).toHaveLength(8);
    expect(after.board.stacks.trading).toHaveLength(30 - 4);
    expect(after.activePlayerIndex).toBe(before.startingPlayers.trading);
    expect(after.log.at(-1)).toMatchObject({ type: 'PASS', playerId: 'p1', payload: { closedPhase: 'aristocrat' } });
  });

  it('rolls the round over when the trading phase’s actions end (pg. 5) — no scoring', () => {
    // A card was taken this trading phase → the worker refill runs at the round transition.
    const before = makeState({ phase: 'trading', activePlayerIndex: 0, consecutivePasses: 1, tookCardThisPhase: true });
    const after = pass(before, 'p1'); // the 2nd consecutive pass closes trading's actions
    expect(after.phase).toBe('worker'); // next round's worker phase
    expect(after.round).toBe(2);
    expect(after.consecutivePasses).toBe(0);
    expect(after.players.map((p) => p.rubles)).toEqual(before.players.map((p) => p.rubles)); // no scoring
    // Round-2 lower row is the round-1 upper (slid down); workers dealt to make 8.
    expect(after.board.lower).toEqual(before.board.upper);
    expect(after.board.upper.length + after.board.lower.length).toBe(8);
    // Markers rotated left; the new worker phase's starter is up.
    expect(after.activePlayerIndex).toBe(after.startingPlayers.worker);
    expect(after.log.at(-1)).toMatchObject({ type: 'PASS', playerId: 'p1', payload: { roundEnded: 1, nextRound: 2 } });
  });
});
