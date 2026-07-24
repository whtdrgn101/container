import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { RussianRailroadsPlayer, RussianRailroadsState } from '../core';
import { expectError, newGame } from './helpers';

/** A game in the reuse mini-phase with `queue` seats owing a reuse move. */
function reusing(queue: number[], patch: Partial<RussianRailroadsPlayer> = {}): RussianRailroadsState {
  const base = newGame(2);
  return {
    ...base,
    pendingReuse: queue,
    activePlayerIndex: queue[0]!,
    players: base.players.map((p, i) => (i === queue[0] ? { ...p, ...patch } : p)),
  };
}
const me = (s: RussianRailroadsState) => s.players[s.activePlayerIndex]!;

describe('reuse mini-phase — resolve a 1-worker space (pg. 17)', () => {
  it('coins: grants coins and opens the new round', () => {
    const s = reusing([0]);
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'coins' });
    expect(after.players[0]!.coins).toBe(s.players[0]!.coins + 2);
    expect(after.pendingReuse).toBeNull();
    expect(after.actionSpaces).toEqual({});
    expect(after.activePlayerIndex).toBe(after.turnOrder[0]);
  });

  it('temp-workers: grants the turquoise workers', () => {
    const s = reusing([0]);
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'temp-workers' });
    expect(after.players[0]!.tempWorkers).toBe(2);
  });

  it('doubler: takes a tile, and is refused when the supply is empty', () => {
    const s = reusing([0]);
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'doubler' });
    expect(after.players[0]!.doublers).toBe(1);
    expect(after.supplies.doublers).toBe(s.supplies.doublers - 1);
    const empty = { ...s, supplies: { ...s.supplies, doublers: 0 } };
    expectError(() => applyAction(empty, me(empty).id, { type: 'RESOLVE_REUSE', space: 'doubler' }), 'ILLEGAL_REUSE_SPACE');
  });

  it('industrialize-1: advances the wrench, and pools a factory it lands on', () => {
    const s = reusing([0], { industry: { wrench: 3, factories: [2, null, null, null, null], secondWrench: null } });
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'industry-1' });
    expect(after.players[0]!.industry.wrench).toBe(4);
    // A plain advance (no factory landed) → queue advances immediately.
    expect(after.pendingReuse).toBeNull();

    // Landing onto the factory (wrench 4 → 5) pools its move-a-track credit and holds the turn.
    const onto = reusing([0], { industry: { wrench: 4, factories: [2, null, null, null, null], secondWrench: null } });
    const pooled = applyAction(onto, me(onto).id, { type: 'RESOLVE_REUSE', space: 'industry-1' });
    expect(pooled.players[0]!.actionPool).toHaveLength(1);
    expect(pooled.pendingReuse).not.toBeNull(); // still mid-reuse; pool resolves first
  });

  it('a track space: opens the moves lock, then MOVE_TRACK advances the queue', () => {
    const s = reusing([0]);
    const opened = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'track-wood-1' });
    expect(opened.pendingMoves).toEqual({ remaining: 2, colors: ['wood'] });
    let done = applyAction(opened, me(opened).id, { type: 'MOVE_TRACK', route: 'transsiberian' });
    done = applyAction(done, me(done).id, { type: 'MOVE_TRACK', route: 'kyiv' });
    // Both moves spent → the queue empties and the round opens.
    expect(done.pendingReuse).toBeNull();
    expect(done.activePlayerIndex).toBe(done.turnOrder[0]);
  });

  it('a track space that cannot advance forfeits and advances the queue', () => {
    const s = reusing([0], {
      routes: newGame(2).players[0]!.routes.map((r) => ({ ...r, spaces: r.spaces.map(() => 'wood' as const) })),
      consumedSpecials: ['transsiberian-key-15', 'stpetersburg-key-9', 'kyiv-key-9', 'kyiv-worker-7'],
    });
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'track-bottom' });
    expect(after.pendingMoves).toBeNull();
    expect(after.pendingReuse).toBeNull();
  });

  it('the 2nd-place claimant resolves before the 1st (queue order)', () => {
    const s = reusing([1, 0]); // seat 1 (2nd claimant) first, then seat 0
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space: 'coins' });
    expect(after.pendingReuse).toEqual([0]);
    expect(after.activePlayerIndex).toBe(0);
  });

  it('legalActions enumerates the legal reuse spaces', () => {
    const s = reusing([0]);
    const spaces = new Set(legalActions(s).map((a) => (a.type === 'RESOLVE_REUSE' ? a.space : '')));
    expect(spaces.has('coins')).toBe(true);
    expect(spaces.has('track-wood-1')).toBe(true);
    expect(spaces.has('industry-1')).toBe(true);
    // Not 2-worker spaces, the worker+coin space, or the loco / turn-order spaces.
    expect(spaces.has('track-wood-2')).toBe(false);
    expect(spaces.has('track-coin')).toBe(false);
    expect(spaces.has('loco-1')).toBe(false);
    expect(spaces.has('turnorder-1')).toBe(false);
    // An occupied reuse candidate drops out.
    const occ = { ...s, actionSpaces: { coins: [{ ownerId: 'p1', workers: 1, coins: 0 }] } };
    expect(new Set(legalActions(occ).map((a) => (a.type === 'RESOLVE_REUSE' ? a.space : ''))).has('coins')).toBe(false);
  });

  it('refuses illegal reuse targets', () => {
    const s = reusing([0]);
    const bad = (space: string) => expectError(() => applyAction(s, me(s).id, { type: 'RESOLVE_REUSE', space }), 'ILLEGAL_REUSE_SPACE');
    bad('track-wood-2'); // 2 workers
    bad('track-coin'); // mandatory coin
    bad('loco-1'); // loco kind (not reusable)
    bad('turnorder-1'); // turn-order kind (not reusable)
    bad('nope'); // unknown space
    // An occupied non-bottom space is refused.
    const occupied = { ...s, actionSpaces: { coins: [{ ownerId: 'p1', workers: 1, coins: 0 }] } };
    expectError(() => applyAction(occupied, me(occupied).id, { type: 'RESOLVE_REUSE', space: 'coins' }), 'ILLEGAL_REUSE_SPACE');
  });
});
