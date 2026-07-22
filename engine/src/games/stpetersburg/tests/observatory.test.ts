import { describe, expect, it } from 'vitest';
import { applyAction, legalActions, observatoryDraw, observatoryResolve } from '../actions';
import type { Board, Card, CardKind, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { legalDisplaceTargets, roundTransition } from '../internal';
import { card, expectError, makeState, newGame } from './helpers';

const area = (over: Partial<PlayArea> = {}): PlayArea => ({ worker: [], building: [], aristocrat: [], ...over });
const observatory = (id = 'obs-1'): Card => card({ id, key: 'observatory', kind: 'building', name: 'Observatory', cost: 6, income: 0, points: 1, special: 'observatory' });
const market = (id: string): Card => card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
const potemkin = (id = 'pot-1'): Card => card({ id, key: 'potemkin', kind: 'building', name: "Potemkin's Village", cost: 2, income: 0, points: 0, special: 'potemkin' });
const worker = (id: string): Card => card({ id, key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, income: 3, ware: 'lumber' });
const carpenterWorkshop = (id = 'cw'): Card => card({ id, key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4, income: 3, ware: 'lumber', tradingGroup: 'worker' });

/** Board with explicit, known stacks so a draw is deterministic. */
function board(stacks: Partial<Record<CardKind, Card[]>>, over: Partial<Board> = {}): Board {
  const base = newGame().board;
  return { ...base, stacks: { ...base.stacks, ...stacks } as Board['stacks'], ...over };
}

/** A building-phase game, seat 0 active + owning the given play area. */
function buildingGame(playArea: PlayArea, b: Board, over: Partial<StPetersburgState> = {}): StPetersburgState {
  const players: StPetersburgPlayer[] = [{ ...newGame().players[0]!, playArea }, newGame().players[1]!];
  return makeState({ players, phase: 'building', activePlayerIndex: 0, board: b, ...over });
}

describe('OBSERVATORY_DRAW (pg. 8)', () => {
  it('draws the top of the chosen stack into a pendingDraw, locking the turn (no advance)', () => {
    const top = market('drawn');
    const b = board({ building: [top, market('b2'), market('b3')] });
    const g = buildingGame(area({ building: [observatory()] }), b);
    const after = observatoryDraw(g, 'p1', 'building');

    expect(after.pendingDraw).toEqual({ seat: 0, stack: 'building', card: top, observatoryId: 'obs-1' });
    expect(after.board.stacks.building).toHaveLength(2); // top popped
    expect(after.board.stacks.building[0]!.id).toBe('b2');
    expect(after.activePlayerIndex).toBe(0); // turn stays locked to the drawer
    expect(after.log.at(-1)).toMatchObject({ type: 'OBSERVATORY_DRAW', payload: { stack: 'building', cardName: 'Market' } });
  });

  it('refuses when it is not the building phase, when no unflipped Observatory is owned, and on a ≤1-card stack', () => {
    const b = board({ building: [market('a'), market('b')] });
    // Wrong phase.
    expectError(() => observatoryDraw(makeState({ players: [{ ...newGame().players[0]!, playArea: area({ building: [observatory()] }) }, newGame().players[1]!], phase: 'worker', board: b }), 'p1', 'building'), 'OBSERVATORY_UNAVAILABLE');
    // No Observatory owned.
    expectError(() => observatoryDraw(buildingGame(area(), b), 'p1', 'building'), 'OBSERVATORY_UNAVAILABLE');
    // The only Observatory is already flipped this round.
    expectError(() => observatoryDraw(buildingGame(area({ building: [observatory('obs-1')] }), b, { observatoryUsed: ['obs-1'] }), 'p1', 'building'), 'OBSERVATORY_UNAVAILABLE');
    // Stack has just its last card — may not be drawn.
    expectError(() => observatoryDraw(buildingGame(area({ building: [observatory()] }), board({ aristocrat: [market('last')] })), 'p1', 'aristocrat'), 'STACK_TOO_SMALL');
  });
});

describe('OBSERVATORY_RESOLVE (pg. 8)', () => {
  /** A game with a pending draw of `drawn`, seat 0 the drawer with the given play area + rubles. */
  function pending(drawn: Card, playArea: PlayArea, over: Partial<StPetersburgPlayer> = {}): StPetersburgState {
    const players: StPetersburgPlayer[] = [{ ...newGame().players[0]!, playArea, ...over }, newGame().players[1]!];
    return makeState({ players, phase: 'building', activePlayerIndex: 0, pendingDraw: { seat: 0, stack: 'building', card: drawn, observatoryId: 'obs-1' } });
  }

  it('discard: the card goes to the discard, the Observatory flips, the turn passes', () => {
    const after = observatoryResolve(pending(market('d'), area({ building: [observatory()] })), 'p1', 'discard');
    expect(after.board.discard).toBe(1);
    expect(after.observatoryUsed).toEqual(['obs-1']); // flipped
    expect(after.pendingDraw).toBeUndefined();
    expect(after.activePlayerIndex).toBe(1); // turn advanced
    expect(after.consecutivePasses).toBe(0);
    expect(after.log.at(-1)).toMatchObject({ type: 'OBSERVATORY_RESOLVE', payload: { choice: 'discard', cardName: 'Market' } });
  });

  it('hand: the card joins the hand (free), the Observatory flips', () => {
    const after = observatoryResolve(pending(market('d'), area({ building: [observatory()] })), 'p1', 'hand');
    expect(after.players[0]!.hand.map((c) => c.id)).toEqual(['d']);
    expect(after.players[0]!.rubles).toBe(25); // free
    expect(after.observatoryUsed).toEqual(['obs-1']);
  });

  it('hand: refused when the hand is already full', () => {
    const full = pending(market('d'), area({ building: [observatory()] }), { hand: [card({ id: 'h1' }), card({ id: 'h2' }), card({ id: 'h3' })] });
    expectError(() => observatoryResolve(full, 'p1', 'hand'), 'HAND_FULL');
  });

  it('buy (non-trading): pays the card cost (no lower-row discount), places it, flips the Observatory', () => {
    const after = observatoryResolve(pending(market('d'), area({ building: [observatory()] })), 'p1', 'buy');
    expect(after.players[0]!.rubles).toBe(25 - 5); // market cost 5, no row discount
    expect(after.players[0]!.playArea.building.some((c) => c.id === 'd')).toBe(true);
    expect(after.observatoryUsed).toEqual(['obs-1']);
  });

  it('buy: a drawn Potemkin pays its printed 2 rubles', () => {
    const after = observatoryResolve(pending(potemkin('d'), area({ building: [observatory()] })), 'p1', 'buy');
    expect(after.players[0]!.rubles).toBe(25 - 2);
  });

  it('buy (trading): displaces an owned card — the difference is charged and the target discarded', () => {
    const state = pending(carpenterWorkshop('d'), area({ worker: [worker('lj')], building: [observatory()] }));
    const after = observatoryResolve(state, 'p1', 'buy', 'lj');
    expect(after.players[0]!.rubles).toBe(25 - 1); // 4 − 3 = 1
    expect(after.players[0]!.playArea.worker.some((c) => c.id === 'd')).toBe(true); // upgrade placed
    expect(after.players[0]!.playArea.worker.some((c) => c.id === 'lj')).toBe(false); // displaced
    expect(after.board.discard).toBe(1);
    expect(after.log.at(-1)).toMatchObject({ payload: { choice: 'buy', displacedName: 'Lumberjack' } });
  });

  it('rejects a trading buy with no target, a non-trading buy carrying one, an unaffordable buy, and no pending', () => {
    expectError(() => observatoryResolve(pending(carpenterWorkshop('d'), area({ worker: [worker('lj')], building: [observatory()] })), 'p1', 'buy'), 'DISPLACE_REQUIRED');
    expectError(() => observatoryResolve(pending(market('d'), area({ building: [observatory()] })), 'p1', 'buy', 'lj'), 'DISPLACE_NOT_ALLOWED');
    expectError(() => observatoryResolve(pending(market('d'), area({ building: [observatory()] }), { rubles: 1 }), 'p1', 'buy'), 'INSUFFICIENT_RUBLES');
    expectError(() => observatoryResolve(makeState(), 'p1', 'discard'), 'NO_DRAW_PENDING');
    // An unrecognised choice (defensive — the parser guards this at the edge).
    expectError(() => observatoryResolve(pending(market('d'), area({ building: [observatory()] })), 'p1', 'sell' as 'discard'), 'INVALID_RESOLVE_CHOICE');
  });
});

describe('Observatory — applyAction routing + turn lock', () => {
  it('routes OBSERVATORY_DRAW then OBSERVATORY_RESOLVE, and refuses everything else while a draw is pending', () => {
    const b = board({ building: [market('a'), market('b'), market('c')] });
    const g = buildingGame(area({ building: [observatory()] }), b);
    const drawn = applyAction(g, 'p1', { type: 'OBSERVATORY_DRAW', stack: 'building' });
    expect(drawn.pendingDraw).toBeTruthy();
    // Locked: no other move until it resolves.
    expectError(() => applyAction(drawn, 'p1', { type: 'PASS' }), 'DRAW_PENDING');
    expectError(() => applyAction(drawn, 'p1', { type: 'BUY', row: 'upper', index: 0 }), 'DRAW_PENDING');
    const resolved = applyAction(drawn, 'p1', { type: 'OBSERVATORY_RESOLVE', choice: 'discard' });
    expect(resolved.pendingDraw).toBeUndefined();
    expect(resolved.observatoryUsed).toEqual(['obs-1']);
  });
});

describe('Observatory — legalActions', () => {
  it('offers OBSERVATORY_DRAW for each ≥2-card stack in the building phase, for an owner of an unflipped one', () => {
    const b = board({ worker: [worker('w1'), worker('w2')], building: [market('a'), market('b')], aristocrat: [market('c')], trading: [] });
    const g = buildingGame(area({ building: [observatory()] }), b);
    const draws = legalActions(g, 'p1').filter((a) => a.type === 'OBSERVATORY_DRAW');
    // worker (2) and building (2) qualify; aristocrat (1) and trading (0) do not.
    expect(draws).toContainEqual({ type: 'OBSERVATORY_DRAW', stack: 'worker' });
    expect(draws).toContainEqual({ type: 'OBSERVATORY_DRAW', stack: 'building' });
    expect(draws).toHaveLength(2);
  });

  it('omits OBSERVATORY_DRAW when the Observatory is flipped, and outside the building phase', () => {
    const b = board({ building: [market('a'), market('b')] });
    const flipped = buildingGame(area({ building: [observatory('obs-1')] }), b, { observatoryUsed: ['obs-1'] });
    expect(legalActions(flipped, 'p1').some((a) => a.type === 'OBSERVATORY_DRAW')).toBe(false);
    const worker0 = makeState({ players: [{ ...newGame().players[0]!, playArea: area({ building: [observatory()] }) }, newGame().players[1]!], phase: 'worker', board: b });
    expect(legalActions(worker0, 'p1').some((a) => a.type === 'OBSERVATORY_DRAW')).toBe(false);
  });

  it('while a draw is pending, enumerates only the resolve choices (discard, hand if room, buy if legal)', () => {
    const drawn = carpenterWorkshop('d');
    const g = makeState({
      players: [{ ...newGame().players[0]!, playArea: area({ worker: [worker('lj')], building: [observatory()] }) }, newGame().players[1]!],
      phase: 'building',
      activePlayerIndex: 0,
      pendingDraw: { seat: 0, stack: 'trading', card: drawn, observatoryId: 'obs-1' },
    });
    const actions = legalActions(g, 'p1');
    expect(actions).toContainEqual({ type: 'OBSERVATORY_RESOLVE', choice: 'discard' });
    expect(actions).toContainEqual({ type: 'OBSERVATORY_RESOLVE', choice: 'hand' });
    expect(actions).toContainEqual({ type: 'OBSERVATORY_RESOLVE', choice: 'buy', displace: 'lj' }); // trading → per target
    expect(actions.every((a) => a.type === 'OBSERVATORY_RESOLVE')).toBe(true);

    // A non-trading drawn card, affordable → a plain buy; hand omitted when full.
    const g2 = makeState({
      players: [{ ...newGame().players[0]!, playArea: area({ building: [observatory()] }), hand: [card({ id: 'h1' }), card({ id: 'h2' }), card({ id: 'h3' })] }, newGame().players[1]!],
      phase: 'building',
      activePlayerIndex: 0,
      pendingDraw: { seat: 0, stack: 'building', card: market('d'), observatoryId: 'obs-1' },
    });
    const a2 = legalActions(g2, 'p1');
    expect(a2).toContainEqual({ type: 'OBSERVATORY_RESOLVE', choice: 'buy' });
    expect(a2.some((a) => a.type === 'OBSERVATORY_RESOLVE' && a.choice === 'hand')).toBe(false); // hand full
  });
});

describe('Observatory — flip interactions', () => {
  it('a flipped Observatory may not be upgraded (displaced) this round', () => {
    const player = { playArea: area({ building: [observatory('obs-1'), market('m')] }) };
    const blueTrader = card({ id: 'bt', key: 'nikolaiChurch', kind: 'trading', name: 'St Nicholas Church', cost: 6, tradingGroup: 'building' });
    // Unflipped → the Observatory is a legal target; flipped → it drops out (only the market remains).
    expect(legalDisplaceTargets(player, blueTrader, []).map((c) => c.id).sort()).toEqual(['m', 'obs-1']);
    expect(legalDisplaceTargets(player, blueTrader, ['obs-1']).map((c) => c.id)).toEqual(['m']);
  });

  it('the round transition turns every Observatory face-up again (observatoryUsed → [])', () => {
    const g = makeState({ phase: 'trading', observatoryUsed: ['obs-1', 'obs-2'] });
    expect(roundTransition(g).observatoryUsed).toEqual([]);
  });
});
