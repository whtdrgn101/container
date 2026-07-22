import { describe, expect, it } from 'vitest';
import { legalActions } from '../actions';
import { HAND_LIMIT } from '../core';
import type { Card, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, makeState, newGame } from './helpers';

/** Override seat 0's fields on a fresh 2-player game (active p1). */
function seat0(over: Partial<StPetersburgPlayer>): StPetersburgState {
  return makeState({ players: newGame().players.map((p, i) => (i === 0 ? { ...p, ...over } : p)) });
}

describe('legalActions (SP1–SP3)', () => {
  it('offers PASS plus an affordable BUY and a free ADD_TO_HAND for every non-trading card in either row', () => {
    const g = newGame(['Ann', 'Bob']); // active p1, 25 rubles, upper = 4 lumberjacks (cost 3), lower empty
    const actions = legalActions(g);
    expect(actions).toContainEqual({ type: 'PASS' });
    expect(actions.filter((a) => a.type === 'BUY')).toHaveLength(4);
    expect(actions).toContainEqual({ type: 'BUY', row: 'upper', index: 0 });
    expect(actions.filter((a) => a.type === 'ADD_TO_HAND')).toHaveLength(4); // add is free — one per row card
    expect(actions).toContainEqual({ type: 'ADD_TO_HAND', row: 'upper', index: 0 });
    // Explicit active-seat query matches the default (active) query.
    expect(legalActions(g, 'p1')).toEqual(actions);
  });

  it('enumerates lower-row buys too', () => {
    const mkt = card({ id: 'mk', key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
    const g = makeState({ board: { ...newGame().board, lower: [mkt] } });
    expect(legalActions(g)).toContainEqual({ type: 'BUY', row: 'lower', index: 0 });
  });

  it('omits BUYs the seat cannot afford, but ADD_TO_HAND (free) survives', () => {
    const broke = seat0({ rubles: 0 }); // 0 rubles, upper = 4 lumberjacks, empty hand
    const actions = legalActions(broke);
    expect(actions.filter((a) => a.type === 'BUY')).toHaveLength(0); // can't afford any
    expect(actions.filter((a) => a.type === 'ADD_TO_HAND')).toHaveLength(4); // adds are free
    expect(actions).toContainEqual({ type: 'PASS' });
  });

  it('offers ADD_TO_HAND for a trading card (any card is hand-eligible) but never a BUY of one (SP4)', () => {
    const tc: Card = card({ id: 'cw', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });
    const g = makeState({ board: { ...newGame().board, upper: [tc], lower: [] } });
    expect(g.board.upper).toHaveLength(1);
    const actions = legalActions(g);
    expect(actions.filter((a) => a.type === 'BUY')).toHaveLength(0); // not buyable yet
    expect(actions).toContainEqual({ type: 'ADD_TO_HAND', row: 'upper', index: 0 }); // but addable to hand
  });

  it('omits ADD_TO_HAND once the hand is full (limit 3 at SP3)', () => {
    const full = seat0({ hand: Array.from({ length: HAND_LIMIT }, (_, i) => card({ id: `h-${i}` })) });
    expect(legalActions(full).filter((a) => a.type === 'ADD_TO_HAND')).toHaveLength(0);
  });

  it('offers PLAY_FROM_HAND for affordable non-trading hand cards, omitting trading and unaffordable ones', () => {
    const affordable = card({ id: 'mk', key: 'market', kind: 'building', name: 'Market', cost: 5, points: 1 });
    const tradingHeld = card({ id: 'cw', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });
    const g = seat0({ hand: [affordable, tradingHeld] });
    const actions = legalActions(g);
    expect(actions).toContainEqual({ type: 'PLAY_FROM_HAND', index: 0 }); // the affordable building
    expect(actions).not.toContainEqual({ type: 'PLAY_FROM_HAND', index: 1 }); // trading — can't be played (SP4)

    // With too few rubles, even the non-trading hand card can't be played.
    const broke = seat0({ hand: [affordable], rubles: 2 });
    expect(legalActions(broke).filter((a) => a.type === 'PLAY_FROM_HAND')).toHaveLength(0);
  });

  it('is empty for an off-turn seat (Saint Petersburg has no off-turn moves)', () => {
    expect(legalActions(newGame(), 'p2')).toEqual([]);
  });

  it('is empty once the game has ended', () => {
    expect(legalActions(makeState({ status: 'ended', results: [], winnerIds: ['p1'] }))).toEqual([]);
  });

  it('in the trading phase with only trading cards: no BUY, but PASS + ADD_TO_HAND (buys refused until SP4)', () => {
    // The trading phase's upper row is dealt from the trading stack; those cards can't be bought yet, but
    // they can be added to hand (any card is hand-eligible), so PASS + one ADD_TO_HAND per card remain.
    const tc = (i: number): Card => card({ id: `t-${i}`, key: 'x', kind: 'trading', name: 'Trade', cost: 4 });
    const g = makeState({ phase: 'trading', board: { ...newGame().board, upper: [tc(0), tc(1)], lower: [] } });
    const actions = legalActions(g);
    expect(actions.filter((a) => a.type === 'BUY')).toHaveLength(0);
    expect(actions.filter((a) => a.type === 'ADD_TO_HAND')).toHaveLength(2);
    expect(actions).toContainEqual({ type: 'PASS' });
  });

  it('still offers a leftover non-trading buy in the trading phase (only trading cards are blocked)', () => {
    const worker = card({ id: 'w', key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3 });
    const g = makeState({ phase: 'trading', board: { ...newGame().board, upper: [worker], lower: [] } });
    expect(legalActions(g)).toContainEqual({ type: 'BUY', row: 'upper', index: 0 });
  });
});
