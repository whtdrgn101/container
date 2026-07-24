import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { Industry, RussianRailroadsPlayer, RussianRailroadsState } from '../core';
import { activeId, expectError, newGame } from './helpers';

/** Patch the active player's fields (industry, routes, …). */
const patchActive = (state: RussianRailroadsState, patch: Partial<RussianRailroadsPlayer>): RussianRailroadsState => ({
  ...state,
  players: state.players.map((p, i) => (i === state.activePlayerIndex ? { ...p, ...patch } : p)),
});

const activePlayer = (state: RussianRailroadsState) => state.players[state.activePlayerIndex]!;
const allWood = (state: RussianRailroadsState): RussianRailroadsPlayer['routes'] =>
  activePlayer(state).routes.map((r) => ({ ...r, spaces: r.spaces.map(() => 'wood' as const) }));

describe('industrialization spaces (pg. 14)', () => {
  it('advances the wrench and passes the turn (no factory landed)', () => {
    const base = newGame(2);
    const placer = base.activePlayerIndex;
    const me = activeId(base);
    const s1 = applyAction(base, me, { type: 'PLACE', space: 'industry-1' });
    expect(s1.players[placer]!.industry.wrench).toBe(1); // the placer's wrench advanced 1
    expect(s1.log.at(-1)).toMatchObject({ type: 'PLACE', payload: { advanced: 1, wrench: 1 } });
    expect(s1.activePlayerIndex).not.toBe(placer); // no pool → turn passes

    const two = applyAction(base, me, { type: 'PLACE', space: 'industry-2' });
    expect(two.players[placer]!.industry.wrench).toBe(2); // the 2-worker space advances 2
  });

  it('a coin factory auto-resolves (choiceless) and does not enter the pool (pg. 13)', () => {
    // Wrench on the 5-space (lane 4); a #6 (coin) factory fills the first gap.
    const industry: Industry = { wrench: 4, factories: [6, null, null, null, null] };
    const base = patchActive(newGame(2), { industry });
    const placer = base.activePlayerIndex;
    const before = base.players[placer]!.coins;
    const s1 = applyAction(base, activeId(base), { type: 'PLACE', space: 'industry-1' });
    expect(s1.players[placer]!.industry.wrench).toBe(5); // moved onto the factory
    expect(s1.players[placer]!.coins).toBe(before + 1); // +1 coin, immediately
    expect(s1.players[placer]!.actionPool).toEqual([]); // nothing deferred
    expect(s1.log.at(-1)).toMatchObject({ type: 'PLACE', payload: { coinsGained: 1 } });
    expect(s1.activePlayerIndex).not.toBe(placer); // no pool → turn passes
  });

  it('legalActions omits a blocked industry space, but keeps the bottom one if its wood bonus can build', () => {
    const base = newGame(2);
    // Wrench on the 5-space with the first gap unfilled → the wrench cannot advance from any industry space.
    const blocked = patchActive(base, { industry: { wrench: 4, factories: [null, null, null, null, null] } });
    const me = activeId(blocked);
    const spaces = legalActions(blocked, me)
      .filter((a): a is { type: 'PLACE'; space: string } => a.type === 'PLACE')
      .map((a) => a.space);
    // industry-1 / industry-2 (pure advances) drop out; industry-3 stays — its wood bonus can still build.
    expect(spaces).not.toContain('industry-1');
    expect(spaces).not.toContain('industry-2');
    expect(spaces).toContain('industry-3');

    // With every route also full of wood, even industry-3's bonus is dead → it drops out too.
    const dead = patchActive(blocked, { routes: allWood(blocked) });
    const deadSpaces = legalActions(dead, me)
      .filter((a): a is { type: 'PLACE'; space: string } => a.type === 'PLACE')
      .map((a) => a.space);
    expect(deadSpaces.some((s) => s.startsWith('industry-'))).toBe(false);
  });

  it('an inert factory yields nothing (lost, pg. 13)', () => {
    const industry: Industry = { wrench: 4, factories: [4, null, null, null, null] }; // #4 is inert
    const base = patchActive(newGame(2), { industry });
    const placer = base.activePlayerIndex;
    const s1 = applyAction(base, activeId(base), { type: 'PLACE', space: 'industry-1' });
    expect(s1.players[placer]!.actionPool).toEqual([]);
    expect(s1.players[placer]!.coins).toBe(base.players[placer]!.coins); // no coins
    expect(s1.activePlayerIndex).not.toBe(placer);
  });
});

describe('the action pool — track-move credits (pg. 13)', () => {
  it('a track-move factory becomes a pool credit; RESOLVE_POOL opens the lock and MOVE_TRACK spends it', () => {
    // #2 (move a track) factory in the first gap; wrench on the 5-space → moving onto it triggers it.
    const industry: Industry = { wrench: 4, factories: [2, null, null, null, null] };
    const base = patchActive(newGame(2), { industry });
    const me = activeId(base);
    const pooled = applyAction(base, me, { type: 'PLACE', space: 'industry-1' });
    expect(activePlayer(pooled).actionPool).toEqual([
      { id: 'factory:2#0', count: 1, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] },
    ]);
    expect(pooled.activePlayerIndex).toBe(base.activePlayerIndex); // turn kept for the pool
    // Everything but a pool resolution is refused while credits are held.
    expectError(() => applyAction(pooled, me, { type: 'PASS' }), 'POOL_PENDING');
    // legalActions offers the resolvable credit + a skip.
    expect(legalActions(pooled, me)).toEqual([{ type: 'RESOLVE_POOL', id: 'factory:2#0' }, { type: 'SKIP_POOL' }]);

    const resolving = applyAction(pooled, me, { type: 'RESOLVE_POOL', id: 'factory:2#0' });
    expect(resolving.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] }); // only wood accessible at setup
    expect(activePlayer(resolving).actionPool).toEqual([]); // the credit left the pool
    const moved = applyAction(resolving, me, { type: 'MOVE_TRACK', route: 'transsiberian' });
    expect(moved.pendingMoves).toBeNull();
    expect(moved.activePlayerIndex).not.toBe(base.activePlayerIndex); // pool empty → turn passes
  });

  it('the bottom industrialization space adds a wood-track credit (pg. 14)', () => {
    const base = newGame(2);
    const me = activeId(base);
    const pooled = applyAction(base, me, { type: 'PLACE', space: 'industry-3' });
    expect(activePlayer(pooled).industry.wrench).toBe(1); // advance 1
    expect(activePlayer(pooled).actionPool).toEqual([{ id: 'industry-wood#0', count: 1, colors: ['wood'] }]);
    const resolving = applyAction(pooled, me, { type: 'RESOLVE_POOL', id: 'industry-wood#0' });
    expect(resolving.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
  });

  it('holds the turn across multiple credits, passing only once the pool empties', () => {
    // industry-3 from the 5-space onto a #2 factory: the factory move-credit AND the wood bonus → two credits.
    const industry: Industry = { wrench: 4, factories: [2, null, null, null, null] };
    const base = patchActive(newGame(2), { industry });
    const me = activeId(base);
    const pooled = applyAction(base, me, { type: 'PLACE', space: 'industry-3' });
    expect(activePlayer(pooled).actionPool.map((e) => e.id)).toEqual(['factory:2#0', 'industry-wood#1']);

    // Spend the first credit fully; the turn stays (a credit remains).
    const r1 = applyAction(pooled, me, { type: 'RESOLVE_POOL', id: 'factory:2#0' });
    const m1 = applyAction(r1, me, { type: 'MOVE_TRACK', route: 'transsiberian' });
    expect(m1.pendingMoves).toBeNull();
    expect(m1.activePlayerIndex).toBe(base.activePlayerIndex); // held — one credit left
    expect(activePlayer(m1).actionPool.map((e) => e.id)).toEqual(['industry-wood#1']);

    // Spend the last credit; now the turn passes.
    const r2 = applyAction(m1, me, { type: 'RESOLVE_POOL', id: 'industry-wood#1' });
    const m2 = applyAction(r2, me, { type: 'MOVE_TRACK', route: 'kyiv' });
    expect(m2.activePlayerIndex).not.toBe(base.activePlayerIndex);
  });

  it('SKIP_POOL forfeits remaining credits and passes the turn (pg. 13)', () => {
    const industry: Industry = { wrench: 4, factories: [2, null, null, null, null] };
    const base = patchActive(newGame(2), { industry });
    const me = activeId(base);
    const pooled = applyAction(base, me, { type: 'PLACE', space: 'industry-1' });
    const skipped = applyAction(pooled, me, { type: 'SKIP_POOL' });
    expect(activePlayer(skipped).actionPool).toEqual([]);
    expect(skipped.activePlayerIndex).not.toBe(base.activePlayerIndex);
    expect(skipped.log.at(-1)).toMatchObject({ type: 'SKIP_POOL', payload: { forfeited: 1 } });
  });

  it('refuses pool resolutions with no pool, and an unknown / unresolvable credit', () => {
    const base = newGame(2);
    const me = activeId(base);
    expectError(() => applyAction(base, me, { type: 'SKIP_POOL' }), 'NO_PENDING_POOL');
    expectError(() => applyAction(base, me, { type: 'RESOLVE_POOL', id: 'x' }), 'NO_PENDING_POOL');

    const pooled = applyAction(
      patchActive(base, { industry: { wrench: 4, factories: [2, null, null, null, null] } }),
      me,
      { type: 'PLACE', space: 'industry-1' },
    );
    expectError(() => applyAction(pooled, me, { type: 'RESOLVE_POOL', id: 'nope' }), 'UNKNOWN_POOL_ENTRY');
  });

  it('an unresolvable credit (no accessible track can advance) can only be skipped', () => {
    // All routes full of wood → nothing can advance and only wood is accessible; the credit is stuck.
    const base = newGame(2);
    const stuck = patchActive(base, { routes: allWood(base), industry: { wrench: 4, factories: [2, null, null, null, null] } });
    const me = activeId(stuck);
    const pooled = applyAction(stuck, me, { type: 'PLACE', space: 'industry-1' });
    expect(legalActions(pooled, me)).toEqual([{ type: 'SKIP_POOL' }]); // no RESOLVE_POOL offered
    expectError(() => applyAction(pooled, me, { type: 'RESOLVE_POOL', id: 'factory:2#0' }), 'POOL_UNRESOLVABLE');
  });
});
