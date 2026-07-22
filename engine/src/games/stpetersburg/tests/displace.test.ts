import { describe, expect, it } from 'vitest';
import { groupOf, legalDisplaceTargets, placeInPlayArea, validateDisplacement } from '../internal';
import type { Card, PlayArea } from '../core';
import { card } from './helpers';

const area = (over: Partial<PlayArea> = {}): PlayArea => ({ worker: [], building: [], aristocrat: [], ...over });

const carpenterWorkshop = card({ id: 'cw', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4, ware: 'lumber', tradingGroup: 'worker' });
const mariinskij = card({ id: 'mar', key: 'mariinskij', kind: 'trading', name: 'Mariinskij Theater', cost: 10, tradingGroup: 'building' });
const abbot = card({ id: 'ab', key: 'abbot', kind: 'trading', name: 'Abbot', cost: 6, income: 1, points: 1, tradingGroup: 'aristocrat' });

const lumberjack = card({ id: 'lj', key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, ware: 'lumber' });
const market = card({ id: 'mk', key: 'market', kind: 'building', name: 'Market', cost: 5, points: 1 });
const scribe = card({ id: 'sc', key: 'scribe', kind: 'aristocrat', name: 'Scribe', cost: 4, income: 1 });

describe('displacement helpers (pg. 7–8)', () => {
  it('groupOf maps a card to its play-area group — trading cards by the group they upgrade', () => {
    expect(groupOf(lumberjack)).toBe('worker');
    expect(groupOf(market)).toBe('building');
    expect(groupOf(scribe)).toBe('aristocrat');
    expect(groupOf(carpenterWorkshop)).toBe('worker'); // green upgrade → worker group
    expect(groupOf(mariinskij)).toBe('building'); // blue upgrade → building group
    expect(groupOf(abbot)).toBe('aristocrat'); // orange upgrade → aristocrat group
  });

  it('a blue trading card displaces ANY building; an orange one ANY aristocrat (pg. 7)', () => {
    const customs = card({ id: 'ch', key: 'customsHouse', kind: 'building', name: 'Customs House', cost: 8, points: 2 });
    const clerk = card({ id: 'ck', key: 'clerk', kind: 'aristocrat', name: 'Clerk', cost: 10, income: 3 });
    expect(legalDisplaceTargets({ playArea: area({ building: [market, customs] }) }, mariinskij).map((c) => c.id)).toEqual(['mk', 'ch']);
    expect(legalDisplaceTargets({ playArea: area({ aristocrat: [scribe, clerk] }) }, abbot).map((c) => c.id)).toEqual(['sc', 'ck']);
  });

  it('never lets a trading card displace another trading card (pg. 7)', () => {
    // A building group holding a plain market and an already-placed Mariinskij: only the market is a target.
    const placedTrading = card({ id: 'mar2', key: 'mariinskij', kind: 'trading', name: 'Mariinskij Theater', cost: 10, tradingGroup: 'building' });
    const targets = legalDisplaceTargets({ playArea: area({ building: [market, placedTrading] }) }, mariinskij);
    expect(targets.map((c) => c.id)).toEqual(['mk']); // the placed trading card is skipped
  });

  it('a green trading card matches by ware symbol, and the Czar by anything (pg. 8)', () => {
    const goldMiner = card({ id: 'gm', key: 'goldMiner', kind: 'worker', name: 'Gold Miner', cost: 4, ware: 'gold' });
    const czar = card({ id: 'cz', key: 'czarCarpenter', kind: 'worker', name: 'Czar the Carpenter', cost: 8 });
    const targets = legalDisplaceTargets({ playArea: area({ worker: [lumberjack, goldMiner, czar] }) }, carpenterWorkshop);
    expect(targets.map((c) => c.id)).toEqual(['lj', 'cz']); // lumberjack (ware match) + czar (any green); gold miner excluded
  });

  it('validateDisplacement returns the target or throws INVALID_DISPLACE_TARGET', () => {
    expect(validateDisplacement({ playArea: area({ worker: [lumberjack] }) }, carpenterWorkshop, 'lj')).toBe(lumberjack);
    expect(() => validateDisplacement({ playArea: area({ worker: [lumberjack] }) }, carpenterWorkshop, 'missing')).toThrow(/INVALID_DISPLACE_TARGET|displaced/);
  });

  it('placeInPlayArea adds the card, removing a displaced one from the same group and counting the discard', () => {
    const withDisplace = placeInPlayArea(area({ worker: [lumberjack] }), carpenterWorkshop, lumberjack);
    expect(withDisplace.playArea.worker.map((c) => c.key)).toEqual(['carpenterWorkshop']);
    expect(withDisplace.discarded).toBe(1);

    const noDisplace = placeInPlayArea(area({ worker: [lumberjack] }), market);
    expect(noDisplace.playArea.building.map((c) => c.key)).toEqual(['market']);
    expect(noDisplace.playArea.worker.map((c) => c.key)).toEqual(['lumberjack']); // untouched
    expect(noDisplace.discarded).toBe(0);
  });
});
