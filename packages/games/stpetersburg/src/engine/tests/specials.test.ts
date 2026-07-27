import { describe, expect, it } from 'vitest';
import { displacementCost } from '../actions';
import { handLimit, HAND_LIMIT, WAREHOUSE_HAND_LIMIT } from '../core';
import type { Card, PlayArea, StPetersburgPlayer } from '../core';
import {
  displaceValueOf,
  mariinskijBonus,
  pubOwnerSeats,
  scorePlayers,
  taxmanBonus,
  unusedObservatories,
} from '../internal';
import { card, makeState, newGame } from './helpers';

const area = (over: Partial<PlayArea> = {}): PlayArea => ({ worker: [], building: [], aristocrat: [], ...over });

// ── Special-card fixtures (pg. 7–8) ──
const pub = (id = 'pub-1'): Card =>
  card({ id, key: 'pub', kind: 'building', name: 'Pub', cost: 1, income: 0, points: 0, special: 'pub' });
const warehouse = (id = 'wh-1'): Card =>
  card({
    id,
    key: 'warehouse',
    kind: 'building',
    name: 'Warehouse',
    cost: 2,
    income: 0,
    points: 0,
    special: 'warehouse',
  });
const observatory = (id = 'obs-1'): Card =>
  card({
    id,
    key: 'observatory',
    kind: 'building',
    name: 'Observatory',
    cost: 6,
    income: 0,
    points: 1,
    special: 'observatory',
  });
const potemkin = (id = 'pot-1'): Card =>
  card({
    id,
    key: 'potemkin',
    kind: 'building',
    name: "Potemkin's Village",
    cost: 2,
    income: 0,
    points: 0,
    special: 'potemkin',
  });
const mariinskij = (id = 'mar-1'): Card =>
  card({
    id,
    key: 'mariinskij',
    kind: 'trading',
    name: 'Mariinskij Theater',
    cost: 10,
    income: 0,
    points: 0,
    tradingGroup: 'building',
    special: 'mariinskij',
  });
const taxman = (id = 'tax-1'): Card =>
  card({
    id,
    key: 'taxman',
    kind: 'trading',
    name: 'Tax Man',
    cost: 17,
    income: 0,
    points: 0,
    tradingGroup: 'aristocrat',
    special: 'taxman',
  });
const worker = (id: string): Card =>
  card({ id, key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, income: 3 });
const aristocrat = (id: string): Card =>
  card({ id, key: 'scribe', kind: 'aristocrat', name: 'Scribe', cost: 4, income: 1, points: 0 });
const market = (id: string): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });

/** A fresh 2-player game with seat 0's play area overridden. */
function seat0(playArea: PlayArea, over: Partial<StPetersburgPlayer> = {}) {
  const base = newGame(['Ann', 'Bob']);
  return { base, player: { ...base.players[0]!, playArea, ...over } };
}

describe('Warehouse — hand limit 4 (pg. 8)', () => {
  it('raises its owner’s hand limit to 4; a non-owner stays at 3', () => {
    const owner: StPetersburgPlayer = { ...newGame().players[0]!, playArea: area({ building: [warehouse()] }) };
    const plain: StPetersburgPlayer = { ...newGame().players[0]!, playArea: area() };
    expect(handLimit(owner)).toBe(WAREHOUSE_HAND_LIMIT);
    expect(handLimit(owner)).toBe(4);
    expect(handLimit(plain)).toBe(HAND_LIMIT);
  });
});

describe('displaceValueOf — Potemkin worth 6 when displaced (pg. 8)', () => {
  it('returns 6 for Potemkin, the printed cost otherwise', () => {
    expect(displaceValueOf(potemkin())).toBe(6);
    expect(displaceValueOf(market('m'))).toBe(5);
  });

  it('a trading card upgrading a Potemkin computes the difference against 6, not its printed 2', () => {
    // St Isaac's (blue trading, cost 15) displacing a Potemkin: 15 − 6 = 9 (would be 13 against cost 2).
    const stIsaac = card({
      id: 'iss',
      key: 'stIsaac',
      kind: 'trading',
      name: "St Isaac's Cathedral",
      cost: 15,
      tradingGroup: 'building',
    });
    const player = { playArea: area({ building: [potemkin()] }) };
    expect(displacementCost(player, stIsaac, potemkin(), undefined)).toBe(9);
  });
});

describe('Mariinskij Theater — +1₽ per aristocrat at building scoring (pg. 7)', () => {
  it('pays the owner 1 ruble per aristocrat when buildings score; nothing for a non-owner', () => {
    const owner = seat0(
      area({ building: [mariinskij(), market('m')], aristocrat: [aristocrat('a1'), aristocrat('a2')] }),
    );
    const state = makeState({ players: [owner.player, owner.base.players[1]!], phase: 'building' });
    const scored = scorePlayers(state);
    // Building scoring: +2₽ (2 aristocrats via Mariinskij) and +1★ (the market). Mariinskij itself scores nothing.
    expect(scored[0]!.rubles).toBe(25 + 2);
    expect(scored[0]!.points).toBe(0 + 1);
    // Seat 1 owns no Mariinskij → no bonus.
    expect(scored[1]!.rubles).toBe(25);
    expect(mariinskijBonus(owner.player)).toBe(2);
    expect(mariinskijBonus(owner.base.players[1]!)).toBe(0);
  });
});

describe('Tax man — +1₽ per worker at aristocrat scoring (pg. 7)', () => {
  it('pays the owner 1 ruble per worker when aristocrats score; nothing for a non-owner', () => {
    const owner = seat0(
      area({ aristocrat: [taxman(), aristocrat('a1')], worker: [worker('w1'), worker('w2'), worker('w3')] }),
    );
    const state = makeState({ players: [owner.player, owner.base.players[1]!], phase: 'aristocrat' });
    const scored = scorePlayers(state);
    // Aristocrat scoring: the scribe pays income 1, plus +3₽ (3 workers via Tax man). Tax man scores nothing.
    expect(scored[0]!.rubles).toBe(25 + 1 + 3);
    expect(taxmanBonus(owner.player)).toBe(3);
    expect(taxmanBonus(owner.base.players[1]!)).toBe(0);
  });
});

describe('Observatory scoring — 1 point only if unused this round (pg. 8)', () => {
  it('an unflipped Observatory scores its point; a flipped one scores 0', () => {
    const owner = seat0(area({ building: [observatory('obs-1')] }));
    const players = [owner.player, owner.base.players[1]!];

    const unused = makeState({ players, phase: 'building', observatoryUsed: [] });
    expect(scorePlayers(unused)[0]!.points).toBe(1);

    const flipped = makeState({ players, phase: 'building', observatoryUsed: ['obs-1'] });
    expect(scorePlayers(flipped)[0]!.points).toBe(0);
  });
});

describe('unusedObservatories / pubOwnerSeats helpers', () => {
  it('unusedObservatories excludes flipped ids', () => {
    const player = { ...newGame().players[0]!, playArea: area({ building: [observatory('a'), observatory('b')] }) };
    expect(unusedObservatories(player, []).map((c) => c.id)).toEqual(['a', 'b']);
    expect(unusedObservatories(player, ['a']).map((c) => c.id)).toEqual(['b']);
  });

  it('pubOwnerSeats lists seats owning a Pub in ascending order, once per seat even with two Pubs', () => {
    const p0 = { ...newGame().players[0]!, playArea: area({ building: [pub('p0-a'), pub('p0-b')] }) };
    const p1 = { ...newGame().players[1]!, playArea: area() };
    const state = makeState({ players: [p0, p1] });
    expect(pubOwnerSeats(state)).toEqual([0]); // two Pubs, still one entry (per-player cap)
    expect(pubOwnerSeats(makeState({ players: [p1, p0] }))).toEqual([1]);
    expect(pubOwnerSeats(makeState())).toEqual([]);
  });
});
