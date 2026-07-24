import { describe, expect, it } from 'vitest';
import { buy, pass } from '../actions';
import type { Board, Card, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { nextPhase, nextSeatIndex, roundTransition, rotateMarkersLeft, scoreAndRefill } from '../internal';
import { card, makeState, newGame } from './helpers';

const area = (over: Partial<PlayArea> = {}): PlayArea => ({ worker: [], building: [], aristocrat: [], ...over });
const controller = (id = 'ctrl-1'): Card =>
  card({ id, key: 'controller', kind: 'aristocrat', name: 'Controller', cost: 14, income: 4, points: 1 });
const buildingCards = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) =>
    card({ id: `b-${i}`, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 }),
  );

/** A game with seat-0 overridden + arbitrary board — for phase-close fixtures. */
function game(
  seat0: Partial<StPetersburgPlayer> = {},
  board: Partial<Board> = {},
  rest: Partial<StPetersburgState> = {},
): StPetersburgState {
  const base = newGame(['Ann', 'Bob']);
  const players = base.players.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p));
  return makeState({ players, board: { ...base.board, ...board }, ...rest });
}

describe('phase helpers', () => {
  it('cycles the four phases and wraps trading → worker (pg. 2)', () => {
    expect(nextPhase('worker')).toBe('building');
    expect(nextPhase('building')).toBe('aristocrat');
    expect(nextPhase('aristocrat')).toBe('trading');
    expect(nextPhase('trading')).toBe('worker');
  });

  it('advances the seat clockwise, wrapping', () => {
    expect(nextSeatIndex(makeState({ activePlayerIndex: 0 }))).toBe(1);
    expect(nextSeatIndex(makeState({ activePlayerIndex: 1 }))).toBe(0); // 2-player wrap
  });
});

describe('scoreAndRefill', () => {
  it('scores the phase kind — coin → rubles (secret), shield → points (public) (pg. 4)', () => {
    // Aristocrat phase, seat 0 owns a controller (income 4, points 1). Board: 4 workers in the upper row.
    const changes = scoreAndRefill(
      game({ playArea: area({ aristocrat: [controller()] }) }, {}, { phase: 'aristocrat' }),
    );
    expect(changes.players![0]!.rubles).toBe(29); // 25 + 4
    expect(changes.players![0]!.points).toBe(1); // 0 + 1
    // A player with no cards of the kind scores nothing.
    expect(changes.players![1]!.rubles).toBe(25);
    expect(changes.players![1]!.points).toBe(0);
  });

  it('scores an upgraded worker by its own card data — a weaving mill pays income 6, a fur shop 3₽ + 2★ (SP4, pg. 7)', () => {
    // A green worker *trading* card lives in the worker group and scores at worker-close by its printed
    // values (item 5: the upgrade rides the card data through the existing phase machinery). Weaving mill
    // raises income to 6; the fur shop keeps income 3 and adds 2 victory points.
    const weavingMill = card({
      id: 'wm',
      key: 'weavingMill',
      kind: 'trading',
      name: 'Weaving Mill',
      cost: 8,
      income: 6,
      points: 0,
      ware: 'wool',
      tradingGroup: 'worker',
    });
    const furShop = card({
      id: 'fs',
      key: 'furShop',
      kind: 'trading',
      name: 'Fur Shop',
      cost: 10,
      income: 3,
      points: 2,
      ware: 'fur',
      tradingGroup: 'worker',
    });
    const changes = scoreAndRefill(
      game({ playArea: area({ worker: [weavingMill, furShop] }) }, {}, { tookCardThisPhase: true }),
    );
    expect(changes.players![0]!.rubles).toBe(25 + 6 + 3); // both incomes
    expect(changes.players![0]!.points).toBe(2); // the fur shop's 2 points
  });

  it('refills the upper row from the next phase’s stack to 8 total, then advances (pg. 4)', () => {
    // Worker phase closing after a card was taken: 4 workers (upper), lower empty → 4 more from buildings.
    const changes = scoreAndRefill(game({}, {}, { tookCardThisPhase: true }));
    expect(changes.phase).toBe('building');
    expect(changes.consecutivePasses).toBe(0);
    expect(changes.tookCardThisPhase).toBe(false); // reset for the new phase
    expect(changes.board!.upper).toHaveLength(8); // 4 kept + 4 dealt
    expect(changes.board!.upper.slice(4).every((c) => c.kind === 'building')).toBe(true);
    expect(changes.board!.stacks.building).toHaveLength(28 - 4);
    // The next phase's starting player is up.
    expect(changes.activePlayerIndex).toBe(newGame().startingPlayers.building);
  });

  it('deals what it can when the next stack is short (SP6 owns the end trigger)', () => {
    // Empty rows (all bought) → need 8, but only 3 buildings left → deal 3.
    const changes = scoreAndRefill(
      game(
        {},
        { upper: [], lower: [], stacks: { worker: [], building: buildingCards(3), aristocrat: [], trading: [] } },
        { tookCardThisPhase: true },
      ),
    );
    expect(changes.board!.upper).toHaveLength(3);
    expect(changes.board!.stacks.building).toHaveLength(0);
  });

  it('skips the refill when no card was taken this phase, but still scores + advances (pg. 8 special case)', () => {
    // Worker phase closing with nobody having bought (`tookCardThisPhase` false): the stacks still turn —
    // the phase advances and workers score — but no building cards are dealt to the board.
    const before = game({ playArea: area({ worker: [card()] }) }, {}, { tookCardThisPhase: false });
    const changes = scoreAndRefill(before);
    expect(changes.phase).toBe('building'); // stacks still turn
    expect(changes.players![0]!.rubles).toBe(28); // 25 + 3 worker income — scoring still runs
    expect(changes.board).toBe(before.board); // untouched — no cards added, stacks unchanged
    expect(changes.board!.stacks.building).toHaveLength(28);
    expect(changes.tookCardThisPhase).toBe(false);
  });
});

describe('rotateMarkersLeft (pg. 5)', () => {
  it('moves every phase’s starting player one seat left (to the next in turn order), wrapping', () => {
    // 3-player game: worker→0, building→1, aristocrat→2, trading→0.
    const rotated = rotateMarkersLeft({ worker: 0, building: 1, aristocrat: 2, trading: 0 }, 3);
    expect(rotated).toEqual({ worker: 1, building: 2, aristocrat: 0, trading: 1 });
  });
});

describe('roundTransition (pg. 5)', () => {
  it('discards the lower row, slides upper → lower, refills workers to 8, rotates markers, next round', () => {
    // A round-2 setup at the trading close: lower has 3 leftovers, upper has 5 (trading) cards, a card was
    // taken this phase so the worker refill runs. Worker stack has plenty.
    const lower = buildingCards(3);
    const upper = Array.from({ length: 5 }, (_, i) =>
      card({ id: `t-${i}`, key: 'x', kind: 'trading', name: 'T', cost: 4 }),
    );
    const workers = Array.from({ length: 10 }, (_, i) => card({ id: `w-${i}`, key: 'lumberjack' }));
    const before = game(
      {},
      { upper, lower, discard: 2, stacks: { worker: workers, building: [], aristocrat: [], trading: [] } },
      {
        phase: 'trading',
        round: 1,
        tookCardThisPhase: true,
        startingPlayers: { worker: 0, building: 1, aristocrat: 0, trading: 1 },
      },
    );
    const changes = roundTransition(before);

    expect(changes.round).toBe(2);
    expect(changes.phase).toBe('worker');
    expect(changes.consecutivePasses).toBe(0);
    expect(changes.tookCardThisPhase).toBe(false);
    // Lower discarded (2 + 3 = 5); the 5 upper cards slid down to become the new lower row.
    expect(changes.board!.discard).toBe(5);
    expect(changes.board!.lower).toEqual(upper);
    // Workers dealt into the upper row to make 8 total (5 lower + 3 new upper).
    expect(changes.board!.upper).toHaveLength(3);
    expect(changes.board!.upper.every((c) => c.key === 'lumberjack')).toBe(true);
    expect(changes.board!.stacks.worker).toHaveLength(7);
    // All four markers moved one seat left; the new worker starter is up.
    expect(changes.startingPlayers).toEqual({ worker: 1, building: 0, aristocrat: 1, trading: 0 });
    expect(changes.activePlayerIndex).toBe(1);
  });

  it('deals workers to 8 unconditionally at round end, even when no card was taken during trading (pg. 5 — the drain-spiral fix)', () => {
    // Round 1 trading close, nobody having bought all round (`tookCardThisPhase` false). pg. 8's special
    // case gates only the mid-round phase refills; pg. 5's round-setup worker deal runs regardless. Under
    // SP2's original (incorrect) gate this was skipped and the board drained round over round — the live
    // play-test bug this corrects. lower empty, upper = the 4 seeded workers, worker stack has 6 to give.
    const upper = Array.from({ length: 4 }, (_, i) => card({ id: `w-${i}`, key: 'lumberjack' }));
    const workers = Array.from({ length: 6 }, (_, i) => card({ id: `ws-${i}`, key: 'lumberjack' }));
    const before = game(
      {},
      { upper, lower: [], discard: 0, stacks: { worker: workers, building: [], aristocrat: [], trading: [] } },
      {
        phase: 'trading',
        tookCardThisPhase: false,
      },
    );
    const changes = roundTransition(before);
    expect(changes.board!.discard).toBe(0); // nothing in the lower row to discard
    expect(changes.board!.lower).toEqual(upper); // the 4 slid down to become the new lower row
    expect(changes.board!.upper).toHaveLength(4); // dealt back to 8 total (4 lower + 4 new) despite no take
    expect(changes.board!.upper.every((c) => c.key === 'lumberjack')).toBe(true);
    expect(changes.board!.stacks.worker).toHaveLength(2); // 6 − 4 dealt
    expect(changes.round).toBe(2);
  });
});

describe('a full worker phase closes end-to-end', () => {
  it('scores workers (+3 rubles each), refills buildings, and opens the building phase', () => {
    let g = newGame(['Ann', 'Bob']); // active p1; upper = 4 lumberjacks
    g = buy(g, 'p1', 'upper', 0); // p1 buys a worker (rubles 22), turn → p2
    g = buy(g, 'p2', 'upper', 0); // p2 buys a worker (rubles 22), turn → p1
    g = pass(g, 'p1'); // consecutivePasses 1, turn → p2
    g = pass(g, 'p2'); // consecutivePasses 2 = player count → phase closes

    // Worker scoring: each seat earns 3 rubles (1 worker, income 3), no points.
    expect(g.players[0]!.rubles).toBe(25); // 22 + 3
    expect(g.players[1]!.rubles).toBe(25);
    expect(g.players.every((p) => p.points === 0)).toBe(true);

    // Advanced to the building phase, refilled to 8 (2 leftover workers + 6 buildings).
    expect(g.phase).toBe('building');
    expect(g.consecutivePasses).toBe(0);
    expect(g.activePlayerIndex).toBe(g.startingPlayers.building);
    expect(g.board.upper).toHaveLength(8);
    expect(g.board.stacks.building).toHaveLength(28 - 6);
    expect(g.log.at(-1)).toMatchObject({ type: 'PASS', playerId: 'p2', payload: { closedPhase: 'worker' } });
  });
});
