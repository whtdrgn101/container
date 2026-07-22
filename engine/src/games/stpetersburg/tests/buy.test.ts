import { describe, expect, it } from 'vitest';
import { buy, costReductions, effectiveCost } from '../actions';
import type { Board, Card, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, expectError, makeState, newGame } from './helpers';

/** A game whose seat-0 player and/or board are overridden — the quick way to arrange a buy fixture. */
function game(seat0: Partial<StPetersburgPlayer> = {}, board: Partial<Board> = {}): StPetersburgState {
  const base = newGame(['Ann', 'Bob']);
  const players = base.players.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p));
  return makeState({ players, board: { ...base.board, ...board } });
}

/** `n` lumberjacks in a play area (for the same-name reduction). */
const lumberjacks = (n: number): Card[] => Array.from({ length: n }, (_, i) => card({ id: `lj-${i}`, key: 'lumberjack' }));
const emptyArea = (worker: Card[] = []): PlayArea => ({ worker, building: [], aristocrat: [] });
const market = (id = 'mk-1'): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });

describe('buy', () => {
  it('moves a card from the row to the play area, charges the cost, and passes the turn', () => {
    const before = newGame(['Ann', 'Bob']); // upper = 4 lumberjacks (cost 3), active p1
    const after = buy(before, 'p1', 'upper', 0);

    expect(after.players[0]!.rubles).toBe(22); // 25 − 3
    expect(after.players[0]!.playArea.worker.map((c) => c.key)).toEqual(['lumberjack']);
    expect(after.board.upper).toHaveLength(3); // rows compact — the bought card is spliced out
    expect(after.activePlayerIndex).toBe(1); // turn passes clockwise
    expect(after.consecutivePasses).toBe(0); // a buy is not a pass
    expect(after.version).toBe(1);
    expect(after.log.at(-1)).toMatchObject({ type: 'BUY', playerId: 'p1', payload: { cardKey: 'lumberjack', cost: 3, row: 'upper' } });

    // The input is never mutated (engine purity).
    expect(before.players[0]!.rubles).toBe(25);
    expect(before.board.upper).toHaveLength(4);
  });

  it('applies the same-name reduction cumulatively, never below 1 ruble (pg. 6)', () => {
    const lj = card({ key: 'lumberjack', cost: 3 });
    expect(costReductions({ playArea: emptyArea(lumberjacks(2)) }, lj, 'upper')).toBe(2);
    expect(effectiveCost({ playArea: emptyArea(lumberjacks(2)) }, lj, 'upper')).toBe(1); // 3 − 2
    expect(effectiveCost({ playArea: emptyArea(lumberjacks(3)) }, lj, 'upper')).toBe(1); // 3 − 3 = 0 → min 1

    // Buying the 3rd lumberjack costs just 1 ruble, charged through `buy`.
    const after = buy(game({ playArea: emptyArea(lumberjacks(2)) }), 'p1', 'upper', 0);
    expect(after.players[0]!.rubles).toBe(24); // 25 − 1
    expect(after.players[0]!.playArea.worker).toHaveLength(3);
  });

  it('gives a −1 reduction for a card bought from the lower row (pg. 6)', () => {
    expect(costReductions({ playArea: emptyArea() }, market(), 'lower')).toBe(1);
    expect(effectiveCost({ playArea: emptyArea() }, market(), 'lower')).toBe(4); // 5 − 1

    const after = buy(game({}, { lower: [market('mk-lower')] }), 'p1', 'lower', 0);
    expect(after.players[0]!.rubles).toBe(21); // 25 − 4
    expect(after.players[0]!.playArea.building.map((c) => c.id)).toEqual(['mk-lower']);
    expect(after.board.lower).toHaveLength(0);
  });

  it('rejects an empty or out-of-range slot (INVALID_CARD_SLOT)', () => {
    expectError(() => buy(newGame(), 'p1', 'upper', 99), 'INVALID_CARD_SLOT');
    expectError(() => buy(newGame(), 'p1', 'lower', 0), 'INVALID_CARD_SLOT'); // lower empty in round 1
  });

  it('refuses buying a trading card — needs displacement (TRADING_NOT_BUYABLE, SP4 seam)', () => {
    const tc = card({ id: 'cw-1', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });
    expectError(() => buy(game({}, { upper: [tc] }), 'p1', 'upper', 0), 'TRADING_NOT_BUYABLE');
  });

  it('refuses a buy the player cannot afford (INSUFFICIENT_RUBLES)', () => {
    expectError(() => buy(game({ rubles: 2 }), 'p1', 'upper', 0), 'INSUFFICIENT_RUBLES'); // lumberjack costs 3
  });
});
