import { describe, expect, it } from 'vitest';
import { BotError } from '../../../kernel';
import { decide } from '../decide';
import { makeState, viewOf } from './helpers';

const dice = () => [1, 2, 3, 4] as const;

describe('decide', () => {
  it('picks a claiming pairing in the selecting phase', () => {
    const state = makeState({ phase: 'selecting', dice: [1, 1, 3, 4], runners: { 2: 2 } });
    expect(decide(viewOf(state), 'p1')).toEqual({ type: 'SELECT', columns: [2, 7] });
  });

  it('rolls (with injected dice) when it must — no runners out', () => {
    const action = decide(viewOf(makeState()), 'p1', { rollDice: dice });
    expect(action).toEqual({ type: 'ROLL', dice: [1, 2, 3, 4] });
  });

  it('stops when the risk model says so', () => {
    const state = makeState({ runners: { 2: 3 }, claimed: { 5: 'p1', 9: 'p1' } });
    expect(decide(viewOf(state), 'p1')).toEqual({ type: 'STOP' });
  });

  it('refuses to roll without injected dice — the bot cannot invent randomness', () => {
    expect(() => decide(viewOf(makeState()), 'p1')).toThrow(BotError);
  });

  it('throws for an off-turn seat', () => {
    expect(() => decide(viewOf(makeState()), 'p2', { rollDice: dice })).toThrow(BotError);
  });

  it('throws once the game has ended', () => {
    expect(() => decide(viewOf(makeState({ status: 'ended', winnerIds: ['p1'] })), 'p1')).toThrow(BotError);
  });
});
