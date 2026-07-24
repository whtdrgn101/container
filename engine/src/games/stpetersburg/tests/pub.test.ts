import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, pass, pubBuy } from '../actions';
import type { Card, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, expectError, makeState, newGame } from './helpers';

const area = (over: Partial<PlayArea> = {}): PlayArea => ({ worker: [], building: [], aristocrat: [], ...over });
const pub = (id = 'pub-1'): Card =>
  card({ id, key: 'pub', kind: 'building', name: 'Pub', cost: 1, income: 0, points: 0, special: 'pub' });
const market = (id: string): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });

/** Seat 0 owns the given play area on a fresh 2-player game. */
function withSeat0(playArea: PlayArea, over: Partial<StPetersburgPlayer> = {}): StPetersburgPlayer[] {
  const base = newGame(['Ann', 'Bob']);
  return [{ ...base.players[0]!, playArea, ...over }, base.players[1]!];
}

/** A building phase one pass from closing (seat 1 about to cast the closing pass). */
function buildingAboutToClose(players: StPetersburgPlayer[], over: Partial<StPetersburgState> = {}): StPetersburgState {
  return makeState({
    players,
    phase: 'building',
    consecutivePasses: 1,
    activePlayerIndex: 1,
    tookCardThisPhase: true,
    ...over,
  });
}

describe('Pub — the after-building buy-points interlude (pg. 8)', () => {
  it('a closing building pass with a Pub owner scores, then pauses on a pendingPubBuy (no refill yet)', () => {
    const players = withSeat0(area({ building: [pub(), market('m')] }));
    const before = buildingAboutToClose(players);
    const boardBefore = before.board;

    const after = pass(before, 'p2'); // the closing pass
    // Building scored (the market's point landed), but the phase did NOT advance.
    expect(after.phase).toBe('building');
    expect(after.players[0]!.points).toBe(1);
    expect(after.board).toBe(boardBefore); // no refill while the window is open
    expect(after.pendingPubBuy).toEqual({ queue: [0] });
    expect(after.activePlayerIndex).toBe(0); // the Pub owner is up
    expect(after.log.at(-1)).toMatchObject({ type: 'PASS', payload: { closedPhase: 'building', pubPending: true } });
  });

  it('PUB_BUY charges 2₽/point, adds the points, then advances the (building) phase when the queue empties', () => {
    const players = withSeat0(area({ building: [pub()] }));
    const pending = makeState({
      players,
      phase: 'building',
      activePlayerIndex: 0,
      tookCardThisPhase: true,
      pendingPubBuy: { queue: [0] },
    });

    const after = pubBuy(pending, 'p1', 3); // 3 points → 6 rubles
    expect(after.players[0]!.rubles).toBe(25 - 6);
    expect(after.players[0]!.points).toBe(3);
    // Queue emptied → the building phase advanced to aristocrat and refilled to 8 (4 kept + 4 aristocrats).
    expect(after.pendingPubBuy).toBeUndefined();
    expect(after.phase).toBe('aristocrat');
    expect(after.board.upper).toHaveLength(8);
    expect(after.activePlayerIndex).toBe(after.startingPlayers.aristocrat);
    expect(after.log.at(-1)).toMatchObject({ type: 'PUB_BUY', payload: { points: 3, cost: 6 } });
  });

  it('PUB_BUY of 0 points declines (no cost) and still advances the queue', () => {
    const players = withSeat0(area({ building: [pub()] }));
    const pending = makeState({
      players,
      phase: 'building',
      activePlayerIndex: 0,
      tookCardThisPhase: false,
      pendingPubBuy: { queue: [0] },
    });
    const after = pubBuy(pending, 'p1', 0);
    expect(after.players[0]!.rubles).toBe(25);
    expect(after.players[0]!.points).toBe(0);
    expect(after.phase).toBe('aristocrat'); // queue emptied → advanced
  });

  it('resolves multiple Pub owners in seat order, advancing only when the last resolves', () => {
    const base = newGame(['Ann', 'Bob', 'Cy']);
    const players = [
      { ...base.players[0]!, playArea: area({ building: [pub('p0')] }) },
      base.players[1]!,
      { ...base.players[2]!, playArea: area({ building: [pub('p2')] }) },
    ];
    const pending = makeState({
      players,
      phase: 'building',
      activePlayerIndex: 0,
      tookCardThisPhase: false,
      pendingPubBuy: { queue: [0, 2] },
    });

    const afterFirst = pubBuy(pending, 'p1', 1);
    expect(afterFirst.pendingPubBuy).toEqual({ queue: [2] });
    expect(afterFirst.activePlayerIndex).toBe(2); // the next Pub owner is up
    expect(afterFirst.phase).toBe('building'); // not yet advanced

    const afterSecond = pubBuy(afterFirst, 'p3', 2);
    expect(afterSecond.pendingPubBuy).toBeUndefined();
    expect(afterSecond.phase).toBe('aristocrat');
  });

  it('rejects too many points, a fractional/negative count, an unaffordable buy, and a buy with no window', () => {
    const players = withSeat0(area({ building: [pub()] }), { rubles: 3 });
    const pending = makeState({ players, phase: 'building', activePlayerIndex: 0, pendingPubBuy: { queue: [0] } });
    expectError(() => pubBuy(pending, 'p1', 6), 'INVALID_PUB_POINTS'); // over the 5-point cap
    expectError(() => pubBuy(pending, 'p1', -1), 'INVALID_PUB_POINTS');
    expectError(() => pubBuy(pending, 'p1', 1.5), 'INVALID_PUB_POINTS');
    expectError(() => pubBuy(pending, 'p1', 2), 'INSUFFICIENT_RUBLES'); // 4₽ needed, has 3
    expectError(() => pubBuy(makeState({ players }), 'p1', 1), 'NO_PUB_PENDING'); // no window open
  });

  it('a closing building pass with NO Pub owner scores + advances normally (no interlude)', () => {
    const players = withSeat0(area({ building: [market('m')] })); // no Pub
    const after = pass(buildingAboutToClose(players), 'p2');
    expect(after.pendingPubBuy).toBeUndefined();
    expect(after.phase).toBe('aristocrat'); // advanced immediately
    expect(after.players[0]!.points).toBe(1); // the market still scored
  });
});

describe('Pub — applyAction routing + legalActions', () => {
  it('applyAction routes PUB_BUY and refuses every other move while the window is open (PUB_PENDING)', () => {
    const players = withSeat0(area({ building: [pub()] }));
    const pending = makeState({ players, phase: 'building', activePlayerIndex: 0, pendingPubBuy: { queue: [0] } });
    expect(applyAction(pending, 'p1', { type: 'PUB_BUY', points: 1 }).players[0]!.points).toBe(1);
    expectError(() => applyAction(pending, 'p1', { type: 'PASS' }), 'PUB_PENDING');
    expectError(() => applyAction(pending, 'p1', { type: 'BUY', row: 'upper', index: 0 }), 'PUB_PENDING');
  });

  it('legalActions offers PUB_BUY 0..min(5, affordable) whole points, and only that', () => {
    const players = withSeat0(area({ building: [pub()] }), { rubles: 5 }); // affords 0,1,2 (2₽ each)
    const pending = makeState({ players, phase: 'building', activePlayerIndex: 0, pendingPubBuy: { queue: [0] } });
    const actions = legalActions(pending, 'p1');
    expect(actions).toEqual([
      { type: 'PUB_BUY', points: 0 },
      { type: 'PUB_BUY', points: 1 },
      { type: 'PUB_BUY', points: 2 },
    ]);

    // With plenty of money the cap is 5.
    const rich = makeState({
      players: withSeat0(area({ building: [pub()] }), { rubles: 100 }),
      phase: 'building',
      activePlayerIndex: 0,
      pendingPubBuy: { queue: [0] },
    });
    expect(legalActions(rich, 'p1').filter((a) => a.type === 'PUB_BUY')).toHaveLength(6); // 0..5
  });
});
