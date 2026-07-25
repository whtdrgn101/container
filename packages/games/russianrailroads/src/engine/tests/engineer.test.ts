import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import {
  engineerCount,
  highestEngineerNumber,
  hiringEngineer,
  hiringIndex,
  takeHiring,
  variableEngineer,
  variableIndex,
} from '../internal';
import type { Engineer, EngineerAction, RussianRailroadsState } from '../core';
import { activeId, newGame } from './helpers';

/** A test engineer with a given action (and optional number, for the majority/scoring helpers). */
function eng(id: string, action: EngineerAction, number = 5): Engineer {
  return { id, number, stack: 'A', action };
}

/** Patch the active player of `state`. */
function withActive(
  state: RussianRailroadsState,
  patch: Partial<RussianRailroadsState['players'][number]>,
): RussianRailroadsState {
  const i = state.activePlayerIndex;
  return { ...state, players: state.players.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) };
}

/** Set the whole engineer strip (a length-6 or length-7 array of engineers-or-null). */
function withStrip(state: RussianRailroadsState, strip: readonly (Engineer | null)[]): RussianRailroadsState {
  return { ...state, engineerStrip: strip };
}

const N = null;

describe('engineer strip geometry + majority helpers (pg. 15–16, 22)', () => {
  it('locates the hiring space (right-most) and the two variable slots', () => {
    const strip7 = [N, N, N, N, N, N, eng('h', { kind: 'coins', count: 1 })];
    expect(hiringIndex(strip7)).toBe(6);
    expect(variableIndex(strip7, 0)).toBe(4);
    expect(variableIndex(strip7, 1)).toBe(5);
    const strip6 = [N, N, N, N, N, eng('h', { kind: 'coins', count: 1 })];
    expect(hiringIndex(strip6)).toBe(5);
    expect(variableIndex(strip6, 0)).toBe(3);
  });

  it('reads the hiring and variable engineers, or null for an empty / out-of-range slot', () => {
    const v0 = eng('v0', { kind: 'coins', count: 1 });
    const v1 = eng('v1', { kind: 'coins', count: 1 });
    const h = eng('h', { kind: 'coins', count: 1 });
    const strip = [N, N, N, N, v0, v1, h];
    expect(hiringEngineer(strip)?.id).toBe('h');
    expect(variableEngineer(strip, 0)?.id).toBe('v0');
    expect(variableEngineer(strip, 1)?.id).toBe('v1');
    expect(variableEngineer(strip, 2)).toBeNull(); // out of range
    expect(variableEngineer([N, N, N, N, N, N], 0)).toBeNull(); // in range but the slot is empty
    expect(hiringEngineer([N, N])).toBeNull();
  });

  it('takeHiring empties only the hiring slot', () => {
    const strip = [eng('a', { kind: 'coins', count: 1 }), eng('h', { kind: 'coins', count: 1 })];
    expect(takeHiring(strip)).toEqual([strip[0], null]);
  });

  it('exposes the majority data — count and highest number', () => {
    const player = newGame(2).players[0]!;
    expect(engineerCount(player)).toBe(0);
    expect(highestEngineerNumber(player)).toBe(0);
    // Descending numbers so the reduce exercises both the "new max" and "keep max" branches.
    const withEng = {
      ...player,
      hiredEngineers: [eng('a', { kind: 'coins', count: 1 }, 13), eng('b', { kind: 'coins', count: 1 }, 4)],
    };
    expect(engineerCount(withEng)).toBe(2);
    expect(highestEngineerNumber(withEng)).toBe(13);
  });
});

describe('HIRE_ENGINEER (pg. 15)', () => {
  it('pays 1 coin, takes the hiring-space engineer, empties the slot, and passes the turn', () => {
    const h = eng('h', { kind: 'coins', count: 2 }, 9);
    let state = withStrip(newGame(2), [N, N, N, N, N, h]);
    const id = activeId(state);
    const coinsBefore = state.players[state.activePlayerIndex]!.coins;
    const first = state.activePlayerIndex;
    state = applyAction(state, id, { type: 'HIRE_ENGINEER' });
    const player = state.players[first]!;
    expect(player.hiredEngineers.map((e) => e.id)).toEqual(['h']);
    expect(player.coins).toBe(coinsBefore - 1);
    expect(state.engineerStrip[5]).toBeNull();
    expect(state.activePlayerIndex).not.toBe(first);
  });

  it('rejects hiring when the hiring space is empty', () => {
    const state = withStrip(newGame(2), [N, N, N, N, N, N]);
    expect(() => applyAction(state, activeId(state), { type: 'HIRE_ENGINEER' })).toThrowError(
      /NO_ENGINEER_TO_HIRE|hire/,
    );
  });

  it('rejects hiring without the coin', () => {
    let state = withStrip(newGame(2), [N, N, N, N, N, eng('h', { kind: 'coins', count: 1 })]);
    state = withActive(state, { coins: 0 });
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'HIRE_ENGINEER' });
    } catch (e) {
      code = (e as { code: string }).code;
    }
    expect(code).toBe('INSUFFICIENT_COINS');
  });
});

describe('USE_ENGINEER — a hired engineer as an indirect action (pg. 7, 15)', () => {
  const setup = (action: EngineerAction, extra: Partial<RussianRailroadsState['players'][number]> = {}) => {
    let state = newGame(2);
    state = withActive(state, { hiredEngineers: [eng('e', action)], ...extra });
    return state;
  };

  it('a moveTrack engineer grants a skippable action-pool credit (keeps the turn)', () => {
    const state = setup({ kind: 'moveTrack', count: 2, colors: ['wood'] });
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    expect(after.players[seat]!.actionPool).toEqual([{ id: 'engineer:e', count: 2, colors: ['wood'] }]);
    expect(after.players[seat]!.usedEngineers).toEqual(['e']);
    expect(after.activePlayerIndex).toBe(seat); // held for the pool
  });

  it('a coins engineer resolves immediately and passes the turn', () => {
    const state = setup({ kind: 'coins', count: 3 });
    const seat = state.activePlayerIndex;
    const before = state.players[seat]!.coins;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    expect(after.players[seat]!.coins).toBe(before + 3);
    expect(after.activePlayerIndex).not.toBe(seat);
  });

  it('a doubler engineer takes a tile (if available) and scores its points', () => {
    const state = setup({ kind: 'doubler', points: 5 });
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    expect(after.players[seat]!.doublers).toBe(1);
    expect(after.players[seat]!.score).toBe(5);
    expect(after.supplies.doublers).toBe(29);
  });

  it('a doubler engineer still scores when no tile can be taken', () => {
    let state = setup({ kind: 'doubler', points: 5 });
    state = { ...state, supplies: { ...state.supplies, doublers: 0 } };
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    expect(after.players[seat]!.doublers).toBe(0);
    expect(after.players[seat]!.score).toBe(5);
    expect(after.supplies.doublers).toBe(0);
  });

  it('a fixed-score engineer scores its printed points', () => {
    const state = setup({ kind: 'score', points: 8 });
    const seat = state.activePlayerIndex;
    expect(applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' }).players[seat]!.score).toBe(8);
  });

  it('scoreEngineers sums the numbers of all hired engineers', () => {
    let state = newGame(2);
    state = withActive(state, {
      hiredEngineers: [eng('e', { kind: 'scoreEngineers' }, 11), eng('x', { kind: 'coins', count: 1 }, 4)],
    });
    const seat = state.activePlayerIndex;
    expect(applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' }).players[seat]!.score).toBe(
      15,
    );
  });

  it('scoreLocomotives sums the 2 highest-number locomotives', () => {
    let state = newGame(2);
    state = withActive(state, {
      hiredEngineers: [eng('e', { kind: 'scoreLocomotives' })],
      locomotives: [
        { number: 4, route: 'transsiberian' },
        { number: 7, route: 'kyiv' },
        { number: 2, route: 'stpetersburg' },
      ],
    });
    const seat = state.activePlayerIndex;
    expect(applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' }).players[seat]!.score).toBe(
      11,
    );
  });

  it('an endBonus engineer (#15) scores its points by default (option omitted / score)', () => {
    const state = setup({ kind: 'endBonus', points: 10 });
    const seat = state.activePlayerIndex;
    const pileBefore = state.endBonusPile.length;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    expect(after.players[seat]!.score).toBe(10); // took the points (pg. 48 "or score 10")
    expect(after.players[seat]!.endBonusCards).toEqual([]); // drew nothing
    expect(after.endBonusPile).toHaveLength(pileBefore); // pile untouched
  });

  it('an endBonus engineer (#15) with option "draw" takes the top pile card (draw-top ruling)', () => {
    const state = setup({ kind: 'endBonus', points: 10 });
    const seat = state.activePlayerIndex;
    const top = state.endBonusPile[0]!;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e', option: 'draw' });
    expect(after.players[seat]!.endBonusCards).toEqual([top]); // drew the top card face-down
    expect(after.players[seat]!.score).toBe(0); // no points when drawing
    expect(after.endBonusPile).toHaveLength(state.endBonusPile.length - 1);
  });

  it('an endBonus engineer (#15) with option "draw" on an empty pile falls back to the points', () => {
    let state = setup({ kind: 'endBonus', points: 10 });
    state = { ...state, endBonusPile: [] };
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e', option: 'draw' });
    expect(after.players[seat]!.endBonusCards).toEqual([]);
    expect(after.players[seat]!.score).toBe(10); // fell back to the points, so it always resolves
  });

  it('rejects an engineer you have not hired', () => {
    const state = newGame(2);
    expect(() => applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'nope' })).toThrowError(
      /ENGINEER_NOT_HIRED|not hired/,
    );
  });

  it('rejects an engineer already used this round', () => {
    const state = withActive(newGame(2), {
      hiredEngineers: [eng('e', { kind: 'coins', count: 1 })],
      usedEngineers: ['e'],
    });
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    } catch (err) {
      code = (err as { code: string }).code;
    }
    expect(code).toBe('ENGINEER_ALREADY_USED');
  });

  it('rejects using an inert engineer', () => {
    const state = withActive(newGame(2), { hiredEngineers: [eng('e', { kind: 'inert', note: 'x' })] });
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'USE_ENGINEER', engineerId: 'e' });
    } catch (err) {
      code = (err as { code: string }).code;
    }
    expect(code).toBe('ENGINEER_INERT');
  });
});

describe('USE_VARIABLE_ENGINEER — a public direct action space (pg. 15–16)', () => {
  const withVar = (action: EngineerAction, extra: Partial<RussianRailroadsState['players'][number]> = {}) => {
    let state = newGame(2);
    state = withStrip(state, [N, N, N, eng('v0', action), N, N]);
    if (Object.keys(extra).length) state = withActive(state, extra);
    return state;
  };

  it('a moveTrack variable engineer opens the pending-moves lock directly (keeps the turn)', () => {
    const state = withVar({ kind: 'moveTrack', count: 2, colors: ['wood'] });
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    expect(after.pendingMoves).toEqual({ remaining: 2, colors: ['wood'] });
    expect(after.actionSpaces['engineer-var-0']).toHaveLength(1);
    expect(after.players[seat]!.workersAvailable).toBe(state.players[seat]!.workersAvailable - 1);
    expect(after.activePlayerIndex).toBe(seat);
  });

  it('a moveTrack variable engineer forfeits and passes when nothing can advance', () => {
    const state = withVar({ kind: 'moveTrack', count: 2, colors: ['gold'] }); // gold not accessible → no step
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    expect(after.pendingMoves).toBeNull();
    expect(after.activePlayerIndex).not.toBe(seat);
  });

  it('an immediate variable engineer resolves and passes the turn', () => {
    const state = withVar({ kind: 'coins', count: 2 });
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    expect(after.players[seat]!.coins).toBe(state.players[seat]!.coins + 2);
    expect(after.activePlayerIndex).not.toBe(seat);
  });

  it('a doubler variable engineer draws down the shared supply', () => {
    const state = withVar({ kind: 'doubler', points: 5 });
    const seat = state.activePlayerIndex;
    const after = applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    expect(after.players[seat]!.doublers).toBe(1);
    expect(after.players[seat]!.score).toBe(5);
    expect(after.supplies.doublers).toBe(29);
  });

  it('an endBonus variable engineer draws the top pile card with option "draw"', () => {
    const state = withVar({ kind: 'endBonus', points: 10 });
    const seat = state.activePlayerIndex;
    const top = state.endBonusPile[0]!;
    const after = applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0, option: 'draw' });
    expect(after.players[seat]!.endBonusCards).toEqual([top]);
    expect(after.endBonusPile).toHaveLength(state.endBonusPile.length - 1);
  });

  it('rejects an empty variable slot and an out-of-range slot', () => {
    const state = withVar({ kind: 'coins', count: 1 });
    expect(() => applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 1 })).toThrowError(
      /No variable engineer/,
    );
    expect(() => applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 2 })).toThrowError(
      /No variable engineer/,
    );
  });

  it('rejects an inert variable engineer', () => {
    const state = withVar({ kind: 'inert', note: 'x' });
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    } catch (err) {
      code = (err as { code: string }).code;
    }
    expect(code).toBe('ENGINEER_INERT');
  });

  it('rejects a variable engineer whose space is already occupied this round', () => {
    let state = withVar({ kind: 'coins', count: 1 });
    state = { ...state, actionSpaces: { 'engineer-var-0': [{ ownerId: 'p9', workers: 1, coins: 0 }] } };
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    } catch (err) {
      code = (err as { code: string }).code;
    }
    expect(code).toBe('SPACE_OCCUPIED');
  });

  it('rejects using a variable engineer with no worker to spend', () => {
    const state = withVar({ kind: 'coins', count: 1 }, { workersAvailable: 0 });
    let code = '';
    try {
      applyAction(state, activeId(state), { type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    } catch (err) {
      code = (err as { code: string }).code;
    }
    expect(code).toBe('INSUFFICIENT_WORKERS');
  });
});

describe('the engineer-coin idea card also hires a free engineer (pg. 47, RR7)', () => {
  const inIdeaCard = (strip: readonly (Engineer | null)[]) => {
    let state = withStrip(newGame(2), strip);
    state = { ...state, pendingIdeaCard: { owed: true } };
    return state;
  };

  it('takes the hiring-space engineer for free and grants the coin', () => {
    const state = inIdeaCard([N, N, N, N, N, eng('h', { kind: 'coins', count: 1 }, 6)]);
    const seat = state.activePlayerIndex;
    const before = state.players[seat]!.coins;
    const after = applyAction(state, activeId(state), { type: 'RESOLVE_IDEA_CARD', card: 'engineer-coin' });
    expect(after.players[seat]!.hiredEngineers.map((e) => e.id)).toEqual(['h']);
    expect(after.players[seat]!.coins).toBe(before + 1);
    expect(after.engineerStrip[5]).toBeNull();
  });

  it('grants just the coin when no engineer is available to hire', () => {
    const state = inIdeaCard([N, N, N, N, N, N]);
    const seat = state.activePlayerIndex;
    const before = state.players[seat]!.coins;
    const after = applyAction(state, activeId(state), { type: 'RESOLVE_IDEA_CARD', card: 'engineer-coin' });
    expect(after.players[seat]!.hiredEngineers).toHaveLength(0);
    expect(after.players[seat]!.coins).toBe(before + 1);
  });
});

describe('legalActions offers the engineer moves (pg. 15–16)', () => {
  it('offers HIRE_ENGINEER, USE_ENGINEER (not inert / used), and USE_VARIABLE_ENGINEER (not inert / occupied / no worker)', () => {
    let state = newGame(2);
    state = withStrip(state, [
      N,
      N,
      N,
      eng('v0', { kind: 'coins', count: 1 }),
      eng('v1', { kind: 'inert', note: 'x' }),
      eng('h', { kind: 'coins', count: 1 }),
    ]);
    state = withActive(state, {
      hiredEngineers: [
        eng('live', { kind: 'coins', count: 1 }),
        eng('used', { kind: 'coins', count: 1 }),
        eng('dead', { kind: 'inert', note: 'x' }),
      ],
      usedEngineers: ['used'],
    });
    const actions = legalActions(state);
    expect(actions).toContainEqual({ type: 'HIRE_ENGINEER' });
    expect(actions).toContainEqual({ type: 'USE_ENGINEER', engineerId: 'live' });
    expect(actions).not.toContainEqual({ type: 'USE_ENGINEER', engineerId: 'used' });
    expect(actions).not.toContainEqual({ type: 'USE_ENGINEER', engineerId: 'dead' });
    expect(actions).toContainEqual({ type: 'USE_VARIABLE_ENGINEER', slot: 0 });
    expect(actions).not.toContainEqual({ type: 'USE_VARIABLE_ENGINEER', slot: 1 }); // inert
  });

  it('does not offer a variable engineer whose space is already occupied', () => {
    let state = newGame(2);
    state = withStrip(state, [
      N,
      N,
      N,
      eng('v0', { kind: 'coins', count: 1 }),
      N,
      eng('h', { kind: 'coins', count: 1 }),
    ]);
    state = { ...state, actionSpaces: { 'engineer-var-0': [{ ownerId: 'p9', workers: 1, coins: 0 }] } };
    expect(legalActions(state)).not.toContainEqual({ type: 'USE_VARIABLE_ENGINEER', slot: 0 });
  });

  it('does not offer HIRE without a coin, nor a variable engineer with no worker', () => {
    let state = newGame(2);
    state = withStrip(state, [
      N,
      N,
      N,
      eng('v0', { kind: 'coins', count: 1 }),
      N,
      eng('h', { kind: 'coins', count: 1 }),
    ]);
    state = withActive(state, { coins: 0, workersAvailable: 0 });
    const actions = legalActions(state);
    expect(actions).not.toContainEqual({ type: 'HIRE_ENGINEER' });
    expect(actions).not.toContainEqual({ type: 'USE_VARIABLE_ENGINEER', slot: 0 });
  });
});
