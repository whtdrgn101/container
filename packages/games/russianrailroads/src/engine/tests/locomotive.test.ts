import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { Action } from '../actions';
import type { Locomotive, RussianRailroadsState } from '../core';
import {
  anyEmptyLocoSlot,
  hasEmptyLocoSlot,
  initialLocoSupply,
  locoResolutions,
  locosOnRoute,
  lowestAvailableLoco,
  returnFactory,
  scorePlayer,
  takeLowestLoco,
} from '../internal';
import { activeId, expectError, newGame } from './helpers';

/** Override the active seat's locomotives and (optionally) set a pending-loco lock. */
function withActiveLoco(
  state: RussianRailroadsState,
  locomotives: Locomotive[],
  pending?: number,
): RussianRailroadsState {
  const active = state.activePlayerIndex;
  return {
    ...state,
    players: state.players.map((p, i) => (i === active ? { ...p, locomotives } : p)),
    pendingLoco: pending === undefined ? null : { number: pending },
  };
}

/** Empty every #2–#9 stack, keeping the two #10 stacks — the pg. 10 "#10 opens once #9 is empty" case. */
function tensOnlySupply(a: number, b: number) {
  return { stacks: {}, tens: [a, b] as const, returnedFactories: 0 };
}

describe('locomotive supply (pg. 4, 10, 12)', () => {
  it('starts each #2–#9 stack at the player count and both #10 stacks likewise', () => {
    expect(initialLocoSupply(4)).toEqual({
      stacks: { 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 },
      tens: [4, 4],
      returnedFactories: 0,
    });
    expect(initialLocoSupply(2).stacks[2]).toBe(2);
  });

  it('takes the lowest-numbered available locomotive first (pg. 10, 12)', () => {
    const supply = { stacks: { 2: 0, 3: 0, 4: 2, 5: 1 }, tens: [4, 4] as const, returnedFactories: 0 };
    expect(lowestAvailableLoco(supply)).toBe(4);
    const drawn = takeLowestLoco(supply);
    expect(drawn.number).toBe(4);
    expect(drawn.supply.stacks[4]).toBe(1); // one #4 left the stack
  });

  it('opens BOTH #10 stacks only once every #2–#9 stack is empty (pg. 10)', () => {
    // While any lower stack has tiles, #10 is never the lowest available.
    expect(lowestAvailableLoco({ stacks: { 9: 1 }, tens: [4, 4], returnedFactories: 0 })).toBe(9);
    // Every #2–#9 empty ⇒ #10 is available (from the first non-empty #10 stack, then the second).
    let supply = tensOnlySupply(2, 3);
    expect(lowestAvailableLoco(supply)).toBe(10);
    const first = takeLowestLoco(supply);
    expect(first).toMatchObject({ number: 10 });
    expect(first.supply.tens).toEqual([1, 3]); // drawn from the first #10 stack
    supply = { ...supply, tens: [0, 3] };
    expect(takeLowestLoco(supply).supply.tens).toEqual([0, 2]); // then from the second
  });

  it('reports an exhausted supply and refuses to draw from it', () => {
    const empty = tensOnlySupply(0, 0);
    expect(lowestAvailableLoco(empty)).toBeNull();
    expectError(() => takeLowestLoco(empty), 'LOCO_SUPPLY_EMPTY');
  });

  it('returns a flipped locomotive to the supply as a factory (pg. 11)', () => {
    expect(returnFactory(initialLocoSupply(4)).returnedFactories).toBe(1);
  });
});

describe('locomotive board helpers (pg. 10–11)', () => {
  it('reads per-route locos, empty slots and the flip gate (Trans-Sib 2, others 1)', () => {
    const player = {
      ...newGame(2).players[0]!,
      locomotives: [
        { number: 3, route: 'transsiberian' },
        { number: 5, route: 'transsiberian' },
        { number: 2, route: 'stpetersburg' },
      ] as Locomotive[],
    };
    expect(locosOnRoute(player, 'transsiberian').map((l) => l.number)).toEqual([3, 5]);
    expect(hasEmptyLocoSlot(player, 'transsiberian')).toBe(false); // 2 = capacity
    expect(hasEmptyLocoSlot(player, 'stpetersburg')).toBe(false); // 1 = capacity
    expect(hasEmptyLocoSlot(player, 'kyiv')).toBe(true); // empty
    expect(anyEmptyLocoSlot(player)).toBe(true); // Kyiv is open
  });

  it('enumerates place / upgrade / flip resolutions, deduping identical upgrade targets', () => {
    // Every route full; Trans-Sib holds two identical #3s (one dedup'd target), St.P #2, Kyiv #4.
    const player = {
      ...newGame(2).players[0]!,
      locomotives: [
        { number: 3, route: 'transsiberian' },
        { number: 3, route: 'transsiberian' },
        { number: 2, route: 'stpetersburg' },
        { number: 4, route: 'kyiv' },
      ] as Locomotive[],
    };
    const resolutions = locoResolutions(player, 5); // holding a #5
    expect(resolutions).toContainEqual({ kind: 'replace', route: 'transsiberian', number: 3 });
    // Only ONE Trans-Siberian #3 target despite two identical locos.
    expect(resolutions.filter((r) => r.kind === 'replace' && r.route === 'transsiberian')).toHaveLength(1);
    expect(resolutions).toContainEqual({ kind: 'replace', route: 'stpetersburg', number: 2 });
    expect(resolutions).toContainEqual({ kind: 'replace', route: 'kyiv', number: 4 });
    // No empty slot anywhere ⇒ flip is offered; no place options.
    expect(resolutions).toContainEqual({ kind: 'flip' });
    expect(resolutions.some((r) => r.kind === 'place')).toBe(false);
  });

  it('offers a place per empty route and never a flip while a slot is open (pg. 11)', () => {
    const player = newGame(2).players[0]!; // only the starting #1 on the Trans-Siberian
    const resolutions = locoResolutions(player, 4);
    // A place onto every route with room: Trans-Sib (1/2), St.P (0/1), Kyiv (0/1).
    expect(resolutions.filter((r) => r.kind === 'place').map((r) => (r as { route: string }).route)).toEqual([
      'transsiberian',
      'stpetersburg',
      'kyiv',
    ]);
    expect(resolutions).toContainEqual({ kind: 'replace', route: 'transsiberian', number: 1 }); // #1 < 4
    expect(resolutions.some((r) => r.kind === 'flip')).toBe(false); // slots open ⇒ no flip
  });
});

describe('acquiring a locomotive (pg. 10, 12)', () => {
  it('takes the lowest loco, opens the pending lock and keeps the turn', () => {
    const state = newGame(4);
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'PLACE', space: 'loco-1' });
    expect(next.pendingLoco).toEqual({ number: 2 }); // #2 is the lowest available
    expect(next.supplies.locomotives.stacks[2]).toBe(3); // one #2 left the stack
    expect(next.activePlayerIndex).toBe(state.activePlayerIndex); // turn kept for placement
    expect(next.actionSpaces['loco-1']).toHaveLength(1);
    expect(next.log[0]).toMatchObject({ type: 'PLACE', payload: { space: 'loco-1', acquired: 2 } });
  });

  it('may pay the 2-worker loco space with coin substitutes (pg. 14)', () => {
    const base = newGame(2);
    const state = {
      ...base,
      players: base.players.map((p, i) => (i === base.activePlayerIndex ? { ...p, coins: 2 } : p)),
    };
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'PLACE', space: 'loco-2', coins: 2 });
    expect(next.pendingLoco).toEqual({ number: 2 });
    expect(next.players.find((p) => p.id === me)!.coins).toBe(0);
  });

  it('refuses a loco space (and omits it) once the supply is exhausted', () => {
    const base = newGame(2);
    const state = { ...base, supplies: { ...base.supplies, locomotives: tensOnlySupply(0, 0) } };
    const me = activeId(state);
    expectError(() => applyAction(state, me, { type: 'PLACE', space: 'loco-1' }), 'LOCO_SUPPLY_EMPTY');
    const spaces = legalActions(state).flatMap((a) => (a.type === 'PLACE' ? [a.space] : []));
    expect(spaces).not.toContain('loco-1');
    expect(spaces).not.toContain('loco-2');
  });
});

describe('placing a held locomotive — PLACE_LOCO (pg. 10)', () => {
  it('places on an empty route slot, clears the lock and passes the turn', () => {
    const state = withActiveLoco(newGame(2), [{ number: 1, route: 'transsiberian' }], 3);
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'PLACE_LOCO', route: 'kyiv' });
    expect(next.players.find((p) => p.id === me)!.locomotives).toContainEqual({ number: 3, route: 'kyiv' });
    expect(next.pendingLoco).toBeNull();
    expect(next.activePlayerIndex).not.toBe(state.activePlayerIndex);
    expect(next.log[0]).toMatchObject({ type: 'PLACE_LOCO', payload: { route: 'kyiv', number: 3 } });
  });

  it('allows a second locomotive on the Trans-Siberian (capacity 2) but refuses a full route', () => {
    const twoOnTrans = withActiveLoco(
      newGame(2),
      [
        { number: 4, route: 'transsiberian' },
        { number: 2, route: 'transsiberian' },
      ],
      3,
    );
    const me = activeId(twoOnTrans);
    expectError(
      () => applyAction(twoOnTrans, me, { type: 'PLACE_LOCO', route: 'transsiberian' }),
      'ILLEGAL_LOCO_PLACEMENT',
    );

    const oneOnTrans = withActiveLoco(newGame(2), [{ number: 4, route: 'transsiberian' }], 3);
    const placed = applyAction(oneOnTrans, activeId(oneOnTrans), { type: 'PLACE_LOCO', route: 'transsiberian' });
    expect(
      placed.players.find((p) => p.id === me)!.locomotives.filter((l) => l.route === 'transsiberian'),
    ).toHaveLength(2);
  });

  it('rejects an unknown route', () => {
    const state = withActiveLoco(newGame(2), [{ number: 1, route: 'transsiberian' }], 3);
    expectError(
      () => applyAction(state, activeId(state), { type: 'PLACE_LOCO', route: 'nowhere' as never }),
      'UNKNOWN_ROUTE',
    );
  });
});

describe('upgrading — REPLACE_LOCO + the pg. 11 chain reaction (verbatim)', () => {
  it('upgrades a lower loco and cascades the displaced one, keeping the turn', () => {
    const state = withActiveLoco(
      newGame(2),
      [
        { number: 1, route: 'transsiberian' },
        { number: 2, route: 'stpetersburg' },
      ],
      4,
    );
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'REPLACE_LOCO', route: 'stpetersburg', number: 2 });
    const locos = next.players.find((p) => p.id === me)!.locomotives;
    expect(locos).toContainEqual({ number: 4, route: 'stpetersburg' }); // the #4 took the slot
    expect(locos.some((l) => l.number === 2)).toBe(false); // the #2 left the board…
    expect(next.pendingLoco).toEqual({ number: 2 }); // …and is now held (the cascade)
    expect(next.activePlayerIndex).toBe(state.activePlayerIndex); // turn kept
    expect(next.log[0]).toMatchObject({
      type: 'REPLACE_LOCO',
      payload: { route: 'stpetersburg', number: 4, replaced: 2 },
    });
  });

  it('rejects upgrading a missing or not-lower target', () => {
    const state = withActiveLoco(newGame(2), [{ number: 3, route: 'kyiv' }], 4);
    const me = activeId(state);
    // No #2 on Kyiv.
    expectError(
      () => applyAction(state, me, { type: 'REPLACE_LOCO', route: 'kyiv', number: 2 }),
      'ILLEGAL_LOCO_UPGRADE',
    );
    // A #5 sits on the Trans-Siberian, but the held #4 can't upgrade it (not lower).
    const higher = withActiveLoco(newGame(2), [{ number: 5, route: 'transsiberian' }], 4);
    expectError(
      () => applyAction(higher, activeId(higher), { type: 'REPLACE_LOCO', route: 'transsiberian', number: 5 }),
      'ILLEGAL_LOCO_UPGRADE',
    );
  });

  it('replaces exactly one of two identical locos on a route (pg. 10)', () => {
    const state = withActiveLoco(
      newGame(2),
      [
        { number: 3, route: 'transsiberian' },
        { number: 3, route: 'transsiberian' },
      ],
      6,
    );
    const me = activeId(state);
    const next = applyAction(state, me, { type: 'REPLACE_LOCO', route: 'transsiberian', number: 3 });
    const trans = next.players.find((p) => p.id === me)!.locomotives.filter((l) => l.route === 'transsiberian');
    expect(trans.map((l) => l.number).sort()).toEqual([3, 6]); // one #3 remains, the #6 joined it
    expect(next.pendingLoco).toEqual({ number: 3 }); // the displaced #3 cascades
  });

  it('runs the pg. 11 chain reaction: #4→St.P, #2→Kyiv, then the #1 flips (examples 3–4)', () => {
    // Trans-Siberian full with two higher locos; St. Petersburg #2; Kyiv #1. The player acquires a #4.
    let state = withActiveLoco(
      newGame(2),
      [
        { number: 6, route: 'transsiberian' },
        { number: 5, route: 'transsiberian' },
        { number: 2, route: 'stpetersburg' },
        { number: 1, route: 'kyiv' },
      ],
      4,
    );
    const me = activeId(state);
    // #4 replaces the #2 on St. Petersburg → the #2 is now held.
    state = applyAction(state, me, { type: 'REPLACE_LOCO', route: 'stpetersburg', number: 2 });
    expect(state.pendingLoco).toEqual({ number: 2 });
    // The #2 replaces the #1 on Kyiv → the #1 is now held; it can reach no route (all full, nothing lower).
    state = applyAction(state, me, { type: 'REPLACE_LOCO', route: 'kyiv', number: 1 });
    expect(state.pendingLoco).toEqual({ number: 1 });
    expect(legalActions(state, me)).toEqual([{ type: 'FLIP_LOCO' }]); // the only legal resolution
    // The #1 flips to a factory and returns to the supply (example 4).
    const before = state.supplies.locomotives.returnedFactories;
    state = applyAction(state, me, { type: 'FLIP_LOCO' });
    expect(state.pendingLoco).toBeNull();
    expect(state.supplies.locomotives.returnedFactories).toBe(before + 1);
    expect(state.activePlayerIndex).not.toBe(me); // the chain ended; the turn passes
    const locos = state.players.find((p) => p.id === me)!.locomotives;
    expect(locos).toContainEqual({ number: 4, route: 'stpetersburg' });
    expect(locos).toContainEqual({ number: 2, route: 'kyiv' });
    expect(locos.some((l) => l.number === 1)).toBe(false); // the #1 left the board as a factory
    expect(state.log.at(-1)).toMatchObject({ type: 'FLIP_LOCO', payload: { number: 1 } });
  });
});

describe('flipping — FLIP_LOCO (pg. 11 constraint)', () => {
  it('refuses to flip while any locomotive slot is still empty', () => {
    // Only the starting #1 on the Trans-Siberian ⇒ St. Petersburg and Kyiv are open.
    const state = withActiveLoco(newGame(2), [{ number: 1, route: 'transsiberian' }], 3);
    expectError(() => applyAction(state, activeId(state), { type: 'FLIP_LOCO' }), 'LOCO_FLIP_NOT_ALLOWED');
  });
});

describe('the pending-loco lock gates every other action (pg. 10–11)', () => {
  it('refuses non-loco actions while a locomotive is held, and loco actions when none is', () => {
    const held = withActiveLoco(newGame(2), [{ number: 1, route: 'transsiberian' }], 3);
    const me = activeId(held);
    expectError(() => applyAction(held, me, { type: 'PASS' }), 'LOCO_PENDING');
    expectError(() => applyAction(held, me, { type: 'PLACE', space: 'coins' }), 'LOCO_PENDING');

    const free = newGame(2);
    expectError(() => applyAction(free, activeId(free), { type: 'PLACE_LOCO', route: 'kyiv' }), 'NO_PENDING_LOCO');
    expectError(() => applyAction(free, activeId(free), { type: 'FLIP_LOCO' }), 'NO_PENDING_LOCO');
  });

  it('enumerates only the loco resolutions in legalActions while holding a loco', () => {
    const state = withActiveLoco(newGame(2), [{ number: 1, route: 'transsiberian' }], 3);
    const actions = legalActions(state, activeId(state)) as Action[];
    expect(actions.every((a) => a.type === 'PLACE_LOCO' || a.type === 'REPLACE_LOCO' || a.type === 'FLIP_LOCO')).toBe(
      true,
    );
    expect(actions).toContainEqual({ type: 'PLACE_LOCO', route: 'kyiv' });
    expect(actions).toContainEqual({ type: 'REPLACE_LOCO', route: 'transsiberian', number: 1 });
  });
});

describe('reach gates scoring — an upgrade changes what scores (pg. 10, 20)', () => {
  it('a longer-reaching locomotive scores more spaces of a route', () => {
    const base = newGame(2).players[0]!;
    // A bronze track whose frontier is on space 5 (spaces 1–5 treated bronze = 2 each).
    const bronzeRoute = {
      id: 'transsiberian' as const,
      spaces: Array.from({ length: 15 }, (_, i) => (i === 4 ? ('bronze' as const) : null)),
    };
    const otherRoutes = base.routes.filter((r) => r.id !== 'transsiberian');

    // A lone #3 reaches space 3 → spaces 1–3 score bronze = 6.
    const withReach3 = {
      ...base,
      locomotives: [{ number: 3, route: 'transsiberian' as const }],
      routes: [bronzeRoute, ...otherRoutes],
    };
    expect(scorePlayer(withReach3).routes).toBe(6);

    // Upgrade to a #5 (reach 5) → spaces 1–5 all score bronze = 10. The upgrade changed what scores.
    const withReach5 = { ...withReach3, locomotives: [{ number: 5, route: 'transsiberian' as const }] };
    expect(scorePlayer(withReach5).routes).toBe(10);

    // A second Trans-Siberian loco sums the reach (pg. 10): #3 + #2 = reach 5 as well.
    const twoLocos = {
      ...withReach3,
      locomotives: [
        { number: 3, route: 'transsiberian' as const },
        { number: 2, route: 'transsiberian' as const },
      ],
    };
    expect(scorePlayer(twoLocos).routes).toBe(10);
  });
});
