import { describe, expect, it } from 'vitest';
import { legalActions } from '../actions';
import type { Card } from '../core';
import { card, makeState, newGame } from './helpers';

describe('legalActions (SP1)', () => {
  it('offers PASS plus an affordable BUY for every non-trading card in either row', () => {
    const g = newGame(['Ann', 'Bob']); // active p1, 25 rubles, upper = 4 lumberjacks (cost 3), lower empty
    const actions = legalActions(g);
    expect(actions).toContainEqual({ type: 'PASS' });
    expect(actions.filter((a) => a.type === 'BUY')).toHaveLength(4);
    expect(actions).toContainEqual({ type: 'BUY', row: 'upper', index: 0 });
    // Explicit active-seat query matches the default (active) query.
    expect(legalActions(g, 'p1')).toEqual(actions);
  });

  it('enumerates lower-row buys too', () => {
    const mkt = card({ id: 'mk', key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
    const g = makeState({ board: { ...newGame().board, lower: [mkt] } });
    expect(legalActions(g)).toContainEqual({ type: 'BUY', row: 'lower', index: 0 });
  });

  it('omits cards the seat cannot afford (only PASS survives)', () => {
    const broke = makeState({ players: newGame().players.map((p, i) => (i === 0 ? { ...p, rubles: 0 } : p)) });
    expect(legalActions(broke)).toEqual([{ type: 'PASS' }]);
  });

  it('omits trading cards — not buyable yet (SP4)', () => {
    const tc: Card = card({ id: 'cw', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });
    const g = makeState({ board: { ...newGame().board, upper: [tc] } });
    expect(legalActions(g).filter((a) => a.type === 'BUY')).toHaveLength(0);
  });

  it('is empty for an off-turn seat (Saint Petersburg has no off-turn moves)', () => {
    expect(legalActions(newGame(), 'p2')).toEqual([]);
  });

  it('is empty once the game has ended', () => {
    expect(legalActions(makeState({ status: 'ended', results: [], winnerIds: ['p1'] }))).toEqual([]);
  });

  it('offers only PASS in the trading phase when the board holds only trading cards (buys refused until SP4)', () => {
    // The trading phase's upper row is dealt from the trading stack; those cards can't be bought yet, so
    // the only legal action is PASS.
    const tc = (i: number): Card => card({ id: `t-${i}`, key: 'x', kind: 'trading', name: 'Trade', cost: 4 });
    const g = makeState({ phase: 'trading', board: { ...newGame().board, upper: [tc(0), tc(1)], lower: [] } });
    expect(legalActions(g)).toEqual([{ type: 'PASS' }]);
  });

  it('still offers a leftover non-trading buy in the trading phase (only trading cards are blocked)', () => {
    const worker = card({ id: 'w', key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3 });
    const g = makeState({ phase: 'trading', board: { ...newGame().board, upper: [worker], lower: [] } });
    expect(legalActions(g)).toContainEqual({ type: 'BUY', row: 'upper', index: 0 });
  });
});
