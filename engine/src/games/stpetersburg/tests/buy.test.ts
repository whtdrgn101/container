import { describe, expect, it } from 'vitest';
import { buy, costReductions, displacementCost, effectiveCost } from '../actions';
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
const emptyArea = (worker: Card[] = [], building: Card[] = [], aristocrat: Card[] = []): PlayArea => ({ worker, building, aristocrat });
const market = (id = 'mk-1'): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
const lumberjack = (id = 'lj-1'): Card => card({ id, key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, ware: 'lumber' });
const scribe = (id = 'sc-1'): Card => card({ id, key: 'scribe', kind: 'aristocrat', name: 'Scribe', cost: 4, income: 1 });
/** Carpenter Workshop — green worker trading card (ware lumber, cost 4), displaces a lumberjack (pg. 7). */
const carpenterWorkshop = (id = 'cw-1'): Card =>
  card({ id, key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4, ware: 'lumber', tradingGroup: 'worker' });

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

  it('applies the owned-card reductions: a carpenter workshop −1 on blue, a gold smelter −1 on orange (pg. 7–8)', () => {
    const smelter = card({ id: 'gs', key: 'goldSmelter', kind: 'trading', name: 'Gold Smelter', cost: 6, ware: 'gold', tradingGroup: 'worker' });
    const withWorkshop = { playArea: emptyArea([carpenterWorkshop()]) };
    const withSmelter = { playArea: emptyArea([smelter]) };
    // Carpenter workshop reduces a blue building buy (market 5 → 4); it does NOT touch an orange aristocrat.
    expect(effectiveCost(withWorkshop, market(), 'upper')).toBe(4);
    expect(effectiveCost(withWorkshop, scribe(), 'upper')).toBe(4); // scribe (orange 4) unaffected by the workshop
    // Gold smelter reduces an orange aristocrat buy (scribe 4 → 3); it does NOT touch a blue building.
    expect(effectiveCost(withSmelter, scribe(), 'upper')).toBe(3);
    expect(effectiveCost(withSmelter, market(), 'upper')).toBe(5); // market (blue 5) unaffected by the smelter
  });

  it('buys a green trading card by displacing its ware partner — pays the difference, discard grows (pg. 7)', () => {
    // Carpenter Workshop (cost 4) displaces a placed Lumberjack (cost 3) → difference 1 ruble.
    const before = game({ playArea: emptyArea([lumberjack('lj-mine')]) }, { upper: [carpenterWorkshop('cw-buy')] });
    const cost = displacementCost(before.players[0]!, carpenterWorkshop(), lumberjack(), 'upper');
    expect(cost).toBe(1); // max(1, 4 − 3)

    const after = buy(before, 'p1', 'upper', 0, 'lj-mine');
    expect(after.players[0]!.rubles).toBe(24); // 25 − 1
    // The workshop is now in the worker group; the lumberjack is gone and the discard grew.
    expect(after.players[0]!.playArea.worker.map((c) => c.key)).toEqual(['carpenterWorkshop']);
    expect(after.board.discard).toBe(1);
    expect(after.board.upper).toHaveLength(0); // the workshop left the row
    expect(after.log.at(-1)).toMatchObject({
      type: 'BUY',
      payload: { cardKey: 'carpenterWorkshop', cost: 1, displacedKey: 'lumberjack', displacedName: 'Lumberjack' },
    });
  });

  it('pays the difference when the trading card is dearer (wharf 12 − ship builder 7 = 5, pg. 8 example)', () => {
    const wharf = card({ id: 'wh', key: 'wharf', kind: 'trading', name: 'Wharf', cost: 12, income: 6, points: 1, ware: 'ship', tradingGroup: 'worker' });
    const shipBuilder = card({ id: 'sb-mine', key: 'shipBuilder', kind: 'worker', name: 'Ship Builder', cost: 7, ware: 'ship' });
    expect(displacementCost({ playArea: emptyArea([shipBuilder]) }, wharf, shipBuilder, 'upper')).toBe(5);
  });

  it('stacks the difference with the lower-row and owned-card reductions (St Isaac 15−5, −1 row, −1 workshop = 8, pg. 7)', () => {
    // The rulebook's worked example: St Isaac's Cathedral (15) displaces a Market (5) from the lower row,
    // with a carpenter workshop owned. 15 − 5 = 10, then −1 (lower) −1 (workshop) = 8.
    const stIsaac = card({ id: 'si', key: 'stIsaac', kind: 'trading', name: "St Isaac's Cathedral", cost: 15, points: 5, tradingGroup: 'building' });
    const player = { playArea: emptyArea([carpenterWorkshop()], [market('mk-mine')]) };
    expect(displacementCost(player, stIsaac, market(), 'lower')).toBe(8);
  });

  it('lets any green trading card displace the Czar (pg. 8), and never below 1 ruble', () => {
    const czar = card({ id: 'cz', key: 'czarCarpenter', kind: 'worker', name: 'Czar the Carpenter', cost: 8 });
    // Carpenter Workshop (cost 4) displaces the Czar (cost 8) → 4 − 8 ≤ 0 → 1 ruble.
    expect(displacementCost({ playArea: emptyArea([czar]) }, carpenterWorkshop(), czar, 'upper')).toBe(1);
    const after = buy(game({ playArea: emptyArea([czar]) }, { upper: [carpenterWorkshop('cw-buy')] }), 'p1', 'upper', 0, 'cz');
    expect(after.players[0]!.playArea.worker.map((c) => c.key)).toEqual(['carpenterWorkshop']); // czar displaced
    expect(after.board.discard).toBe(1);
  });

  it('requires a displacement target for a trading card (DISPLACE_REQUIRED)', () => {
    expectError(() => buy(game({}, { upper: [carpenterWorkshop()] }), 'p1', 'upper', 0), 'DISPLACE_REQUIRED');
  });

  it('rejects a displacement target on a non-trading card (DISPLACE_NOT_ALLOWED)', () => {
    expectError(() => buy(newGame(), 'p1', 'upper', 0, 'anything'), 'DISPLACE_NOT_ALLOWED'); // upper[0] is a plain worker
  });

  it('rejects a stale/illegal displacement target (INVALID_DISPLACE_TARGET)', () => {
    // No lumberjack owned to displace.
    expectError(() => buy(game({}, { upper: [carpenterWorkshop()] }), 'p1', 'upper', 0, 'nope'), 'INVALID_DISPLACE_TARGET');
    // A green trading card can't displace a ware-mismatched worker (gold miner ≠ lumber).
    const goldMiner = card({ id: 'gm', key: 'goldMiner', kind: 'worker', name: 'Gold Miner', cost: 4, ware: 'gold' });
    expectError(
      () => buy(game({ playArea: emptyArea([goldMiner]) }, { upper: [carpenterWorkshop()] }), 'p1', 'upper', 0, 'gm'),
      'INVALID_DISPLACE_TARGET',
    );
  });

  it('refuses a buy the player cannot afford (INSUFFICIENT_RUBLES)', () => {
    expectError(() => buy(game({ rubles: 2 }), 'p1', 'upper', 0), 'INSUFFICIENT_RUBLES'); // lumberjack costs 3
  });

  it('refuses an unaffordable trading displacement too (INSUFFICIENT_RUBLES)', () => {
    const wharf = card({ id: 'wh', key: 'wharf', kind: 'trading', name: 'Wharf', cost: 12, ware: 'ship', tradingGroup: 'worker' });
    const shipBuilder = card({ id: 'sb', key: 'shipBuilder', kind: 'worker', name: 'Ship Builder', cost: 7, ware: 'ship' });
    // 12 − 7 = 5 rubles; the seat has 2.
    expectError(
      () => buy(game({ rubles: 2, playArea: emptyArea([shipBuilder]) }, { upper: [wharf] }), 'p1', 'upper', 0, 'sb'),
      'INSUFFICIENT_RUBLES',
    );
  });
});
