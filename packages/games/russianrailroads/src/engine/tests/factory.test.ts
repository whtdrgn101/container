import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { LocomotiveSupply, RussianRailroadsState } from '../core';
import {
  availableReturnedFactories,
  canBuildFactory,
  canBuildLocoAndFactory,
  returnFactory,
  takeReturnedFactory,
} from '../internal';
import { activeId, expectError, newGame } from './helpers';

const EMPTY: LocomotiveSupply = { stacks: {}, tens: [0, 0], returnedFactories: {} };

/** Replace the shared locomotive supply. */
const withSupply = (state: RussianRailroadsState, locomotives: LocomotiveSupply): RussianRailroadsState => ({
  ...state,
  supplies: { ...state.supplies, locomotives },
});

/** Set the active player's industry gap fills. */
const withGaps = (state: RussianRailroadsState, factories: (number | null)[]): RussianRailroadsState => ({
  ...state,
  players: state.players.map((p, i) =>
    i === state.activePlayerIndex ? { ...p, industry: { ...p.industry, factories } } : p,
  ),
});

/** The industry of a specific seat (the *placer* — the turn may have passed after a build). */
const industryOf = (state: RussianRailroadsState, seat: number) => state.players[seat]!.industry;

describe('locomotive/factory supply helpers (pg. 12)', () => {
  it('tracks returned factories by number', () => {
    const s = returnFactory(returnFactory(EMPTY, 5), 5);
    expect(s.returnedFactories).toEqual({ 5: 2 });
    expect(availableReturnedFactories(s)).toEqual([5]);
    expect(takeReturnedFactory(s, 5).returnedFactories).toEqual({ 5: 1 });
    expectError(() => takeReturnedFactory(EMPTY, 7), 'NO_SUCH_FACTORY');
    // A drained (0-count) entry is not "available".
    expect(availableReturnedFactories({ ...EMPTY, returnedFactories: { 6: 0 } })).toEqual([]);
  });

  it('canBuildFactory / canBuildLocoAndFactory gate on available tiles', () => {
    expect(canBuildFactory(EMPTY)).toBe(false);
    expect(canBuildFactory({ ...EMPTY, returnedFactories: { 5: 1 } })).toBe(true);
    expect(canBuildFactory({ ...EMPTY, stacks: { 2: 1 } })).toBe(true);
    // Both needs two tiles' worth: one loco leaves nothing → false; a loco + a returned factory → true.
    expect(canBuildLocoAndFactory(EMPTY)).toBe(false);
    expect(canBuildLocoAndFactory({ ...EMPTY, stacks: { 2: 1 } })).toBe(false);
    expect(canBuildLocoAndFactory({ ...EMPTY, stacks: { 2: 1 }, returnedFactories: { 6: 1 } })).toBe(true);
    expect(canBuildLocoAndFactory({ ...EMPTY, stacks: { 2: 2 } })).toBe(true);
  });
});

describe('building a factory from a "loco or factory" space (pg. 12)', () => {
  it('takes the lowest locomotive, flips it, and fills the leftmost gap', () => {
    const base = newGame(2);
    const seat = base.activePlayerIndex;
    const me = activeId(base);
    const owed = applyAction(base, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expect(owed.pendingFactory).toEqual({ owed: true });
    expect(owed.pendingLoco).toBeNull();
    // Everything but a factory resolution is refused while owed.
    expectError(() => applyAction(owed, me, { type: 'PASS' }), 'FACTORY_PENDING');

    const built = applyAction(owed, me, { type: 'PLACE_FACTORY' });
    expect(industryOf(built, seat).factories).toEqual([2, null, null, null, null]); // lowest #2 → first gap
    expect(built.supplies.locomotives.stacks[2]).toBe(1); // one #2 left the stack
    expect(built.pendingFactory).toBeNull();
    expect(built.activePlayerIndex).not.toBe(seat); // turn passed
    expect(built.log.at(-1)).toMatchObject({ type: 'PLACE_FACTORY', payload: { number: 2, slot: 0 } });
  });

  it('can build from a returned factory instead of the lowest locomotive', () => {
    const base = withSupply(newGame(2), { stacks: { 2: 1 }, tens: [0, 0], returnedFactories: { 6: 1 } });
    const seat = base.activePlayerIndex;
    const me = activeId(base);
    const owed = applyAction(base, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    const built = applyAction(owed, me, { type: 'PLACE_FACTORY', from: 6 });
    expect(industryOf(built, seat).factories[0]).toBe(6); // the returned #6, not the lowest #2
    expect(built.supplies.locomotives.stacks[2]).toBe(1); // the #2 stack was untouched
    expect(built.supplies.locomotives.returnedFactories[6] ?? 0).toBe(0); // the returned #6 was consumed
  });

  it('refuses to build a factory with nothing in the supply (pg. 12)', () => {
    const base = withSupply(newGame(2), EMPTY);
    const me = activeId(base);
    expectError(
      () => applyAction(base, me, { type: 'PLACE', space: 'loco-1', build: 'factory' }),
      'FACTORY_UNAVAILABLE',
    );
  });

  it('refuses a factory resolution with no factory owed', () => {
    const base = newGame(2);
    expectError(() => applyAction(base, activeId(base), { type: 'PLACE_FACTORY' }), 'NO_PENDING_FACTORY');
  });

  it('refuses a bare PLACE_FACTORY when only a returned factory (no locomotive) is available', () => {
    // Owe a factory from a returned-only supply, then resolve without naming `from` → no lowest loco.
    const base = withSupply(newGame(2), { stacks: {}, tens: [0, 0], returnedFactories: { 6: 1 } });
    const me = activeId(base);
    const owed = applyAction(base, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expectError(() => applyAction(owed, me, { type: 'PLACE_FACTORY' }), 'FACTORY_UNAVAILABLE');
  });
});

describe('replacing factories once all 5 gaps are filled (pg. 12)', () => {
  it('PLACE_FACTORY is illegal when full; REPLACE_FACTORY swaps a slot and returns the old one', () => {
    const full = withGaps(newGame(2), [2, 3, 4, 5, 6]);
    const seat = full.activePlayerIndex;
    const me = activeId(full);
    const owed = applyAction(full, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expectError(() => applyAction(owed, me, { type: 'PLACE_FACTORY' }), 'ILLEGAL_FACTORY_PLACEMENT');

    const replaced = applyAction(owed, me, { type: 'REPLACE_FACTORY', slot: 1 });
    expect(industryOf(replaced, seat).factories).toEqual([2, 2, 4, 5, 6]); // slot 1 now holds the lowest #2
    expect(replaced.supplies.locomotives.returnedFactories[3] ?? 0).toBe(1); // the replaced #3 returned
    expect(replaced.log.at(-1)).toMatchObject({
      type: 'REPLACE_FACTORY',
      payload: { number: 2, slot: 1, replaced: 3 },
    });
  });

  it('REPLACE_FACTORY is illegal before all gaps are filled, or for a bad slot', () => {
    const partial = withGaps(newGame(2), [2, null, null, null, null]);
    const me = activeId(partial);
    const owed = applyAction(partial, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expectError(() => applyAction(owed, me, { type: 'REPLACE_FACTORY', slot: 0 }), 'ILLEGAL_FACTORY_PLACEMENT');

    const full = withGaps(newGame(2), [2, 3, 4, 5, 6]);
    const owed2 = applyAction(full, activeId(full), { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expectError(
      () => applyAction(owed2, activeId(full), { type: 'REPLACE_FACTORY', slot: 9 }),
      'ILLEGAL_FACTORY_PLACEMENT',
    );
  });
});

describe('the 3-worker "locomotive AND factory" space (pg. 12)', () => {
  it('loco first: place the loco, then owes the factory, then passes', () => {
    const base = newGame(2);
    const seat = base.activePlayerIndex;
    const me = activeId(base);
    const s1 = applyAction(base, me, { type: 'PLACE', space: 'loco-3', first: 'loco' });
    expect(s1.pendingLoco).toEqual({ number: 2 });
    expect(s1.pendingThen).toBe('factory');
    // Resolve the loco onto the empty Kyiv route → the factory step opens, turn kept.
    const s2 = applyAction(s1, me, { type: 'PLACE_LOCO', route: 'kyiv' });
    expect(s2.pendingLoco).toBeNull();
    expect(s2.pendingFactory).toEqual({ owed: true });
    expect(s2.pendingThen).toBeNull();
    expect(s2.activePlayerIndex).toBe(seat); // still this seat's turn
    const s3 = applyAction(s2, me, { type: 'PLACE_FACTORY' });
    expect(industryOf(s3, seat).factories[0]).toBe(2);
    expect(s3.activePlayerIndex).not.toBe(seat); // both built → turn passes
  });

  it('factory first: build the factory, then owes the loco, then passes', () => {
    const base = newGame(2);
    const seat = base.activePlayerIndex;
    const me = activeId(base);
    const s1 = applyAction(base, me, { type: 'PLACE', space: 'loco-3', first: 'factory' });
    expect(s1.pendingFactory).toEqual({ owed: true });
    expect(s1.pendingThen).toBe('loco');
    const s2 = applyAction(s1, me, { type: 'PLACE_FACTORY' }); // factory = lowest #2
    expect(industryOf(s2, seat).factories[0]).toBe(2);
    expect(s2.pendingFactory).toBeNull();
    // The loco step then draws the lowest available (still a #2 — the 2-player supply holds two of each).
    expect(s2.pendingLoco).toEqual({ number: 2 });
    expect(s2.pendingThen).toBeNull();
    const s3 = applyAction(s2, me, { type: 'PLACE_LOCO', route: 'kyiv' });
    expect(s3.activePlayerIndex).not.toBe(seat);
  });

  it('refuses the space when the supply cannot satisfy both (pg. 12)', () => {
    const base = withSupply(newGame(2), { stacks: { 2: 1 }, tens: [0, 0], returnedFactories: {} });
    expectError(
      () => applyAction(base, activeId(base), { type: 'PLACE', space: 'loco-3', first: 'loco' }),
      'FACTORY_UNAVAILABLE',
    );
  });
});

describe('legalActions under a pending-factory lock (pg. 12)', () => {
  it('offers a PLACE_FACTORY per source while a gap is open', () => {
    const base = withSupply(newGame(2), { stacks: { 2: 1 }, tens: [0, 0], returnedFactories: { 6: 1 } });
    const me = activeId(base);
    const owed = applyAction(base, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    expect(legalActions(owed, me)).toEqual([
      { type: 'PLACE_FACTORY' }, // the lowest locomotive
      { type: 'PLACE_FACTORY', from: 6 }, // the returned #6
    ]);
  });

  it('offers a REPLACE_FACTORY per slot × source once all gaps are filled', () => {
    // A returned #7 plus the lowest #2 → two sources, five slots = ten replacements.
    const full = withGaps(
      withSupply(newGame(2), { stacks: { 2: 1 }, tens: [0, 0], returnedFactories: { 7: 1 } }),
      [2, 3, 4, 5, 6],
    );
    const me = activeId(full);
    const owed = applyAction(full, me, { type: 'PLACE', space: 'loco-1', build: 'factory' });
    const replaces = legalActions(owed, me);
    expect(replaces).toHaveLength(10);
    expect(replaces).toContainEqual({ type: 'REPLACE_FACTORY', slot: 0 }); // the lowest locomotive
    expect(replaces).toContainEqual({ type: 'REPLACE_FACTORY', slot: 3, from: 7 }); // the returned #7
  });

  it('offers both build and factory options on a "loco or factory" space, and both orders on "and"', () => {
    const base = newGame(2);
    const actions = legalActions(base, activeId(base));
    const loco1 = actions.filter((a) => a.type === 'PLACE' && a.space === 'loco-1');
    expect(loco1).toContainEqual({ type: 'PLACE', space: 'loco-1', build: 'loco' });
    expect(loco1).toContainEqual({ type: 'PLACE', space: 'loco-1', build: 'factory' });
    const loco3 = actions.filter((a) => a.type === 'PLACE' && a.space === 'loco-3');
    expect(loco3).toContainEqual({ type: 'PLACE', space: 'loco-3', first: 'loco' });
    expect(loco3).toContainEqual({ type: 'PLACE', space: 'loco-3', first: 'factory' });
  });

  it('offers only the factory option when the supply has a returned factory but no locomotive', () => {
    // No locomotives left, but a returned #6 sits in the supply → only a factory can be built.
    const noCoins = { stacks: {}, tens: [0, 0] as const, returnedFactories: { 6: 1 } };
    const base = withSupply({ ...newGame(2), players: newGame(2).players.map((p) => ({ ...p, coins: 0 })) }, noCoins);
    const actions = legalActions(base, activeId(base));
    const loco1 = actions.filter((a) => a.type === 'PLACE' && a.space === 'loco-1');
    expect(loco1).toEqual([{ type: 'PLACE', space: 'loco-1', build: 'factory' }]);
    // loco-3 (needs both a loco and a factory) drops out entirely.
    expect(actions.some((a) => a.type === 'PLACE' && a.space === 'loco-3')).toBe(false);
  });
});
