import { describe, expect, it } from 'vitest';
import { applyAction, place } from '../actions';
import { activeId } from './helpers';
import type { Locomotive, Route, RouteId, RussianRailroadsPlayer, RussianRailroadsState, TrackColor } from '../core';
import { bonusStarScore, frontierIndex, routeDoubled, scorePlayer, settleSpecials, specialMet } from '../internal';
import { newGame } from './helpers';

/** A route with the given colour tiles at the given 0-based indices, on a 15/9/9-length board. */
function route(id: RouteId, tiles: Partial<Record<number, TrackColor>>): Route {
  const length = id === 'transsiberian' ? 15 : 9;
  return { id, spaces: Array.from({ length }, (_, i) => tiles[i] ?? null) };
}

/** Patch the active seat's board (routes / locomotives / …). */
function patch(state: RussianRailroadsState, fields: Partial<RussianRailroadsPlayer>): RussianRailroadsState {
  const seat = state.activePlayerIndex;
  return { ...state, players: state.players.map((p, i) => (i === seat ? { ...p, ...fields } : p)) };
}

const seatOf = (s: RussianRailroadsState) => s.players[s.activePlayerIndex]!;

describe('player-board specials — reached model (pp. 18–19)', () => {
  it('frontierIndex is the furthest reached space, or −1 on an empty route', () => {
    expect(frontierIndex(route('kyiv', { 0: 'wood', 4: 'green' }))).toBe(4);
    expect(frontierIndex({ id: 'kyiv', spaces: [null, null, null] })).toBe(-1);
  });

  it('specialMet is false for a route the player does not have', () => {
    const player = { ...newGame(2).players[0]!, routes: [] as readonly Route[] };
    expect(specialMet(player, { id: 'x', route: 'kyiv', space: 1, type: 'key', requiresLoco: false })).toBe(false);
  });
});

describe('new-worker specials (pp. 18–19)', () => {
  it('a wood-only new-worker space grants a permanent worker (Kyiv space 7)', () => {
    // Kyiv wood at space 7 (index 6), consuming nothing else; no loco needed.
    const state = patch(newGame(2), { routes: [route('transsiberian', { 0: 'wood' }), route('stpetersburg', { 0: 'wood' }), route('kyiv', { 6: 'wood' })] });
    const seat = state.activePlayerIndex;
    const settled = settleSpecials(state, seat);
    expect(settled.held).toBe(false);
    const me = settled.players[seat]!;
    expect(me.workersTotal).toBe(state.players[seat]!.workersTotal + 1);
    expect(me.workersAvailable).toBe(state.players[seat]!.workersAvailable + 1);
    expect(me.consumedSpecials).toContain('kyiv-worker-7');
  });

  it('a loco-required new-worker space needs the loco reach too (Trans-Sib space 3)', () => {
    const locos: Locomotive[] = [{ number: 3, route: 'transsiberian' }];
    const reached = patch(newGame(2), { routes: [route('transsiberian', { 2: 'wood' }), route('stpetersburg', { 0: 'wood' }), route('kyiv', { 0: 'wood' })], locomotives: locos });
    const seat = reached.activePlayerIndex;
    expect(settleSpecials(reached, seat).players[seat]!.consumedSpecials).toContain('transsiberian-worker-3');
    // Without the loco (reach 1 < 3) it does not fire.
    const noLoco = patch(reached, { locomotives: [{ number: 1, route: 'transsiberian' }] });
    expect(settleSpecials(noLoco, seat).players[seat]!.consumedSpecials).not.toContain('transsiberian-worker-3');
  });
});

describe('keys — end-station benefit (pg. 19)', () => {
  it('reaching a route end owes a key choice and counts the key', () => {
    // Kyiv wood at space 9 (the end); pre-consume the worker so only the key fires.
    const state = patch(newGame(2), {
      routes: [route('transsiberian', { 0: 'wood' }), route('stpetersburg', { 0: 'wood' }), route('kyiv', { 8: 'wood' })],
      consumedSpecials: ['kyiv-worker-7'],
    });
    const seat = state.activePlayerIndex;
    const settled = settleSpecials(state, seat);
    expect(settled.held).toBe(true);
    expect(settled.changes.pendingKey).toEqual({ remaining: 1 });
    expect(settled.players[seat]!.keysReceived).toBe(1);
  });

  it('RESOLVE_KEY points scores 10, and moves grants two pool credits (pg. 19)', () => {
    const base = newGame(2);
    const seat = base.activePlayerIndex;
    const withKey: RussianRailroadsState = { ...base, pendingKey: { remaining: 1 } };
    const pts = applyAction(withKey, seatOf(withKey).id, { type: 'RESOLVE_KEY', option: 'points' });
    expect(pts.players[seat]!.score).toBe(base.players[seat]!.score + 10);
    expect(pts.pendingKey).toBeNull();

    const mv = applyAction(withKey, seatOf(withKey).id, { type: 'RESOLVE_KEY', option: 'moves' });
    expect(mv.players[seat]!.actionPool).toEqual([
      { id: 'key-wood#0', count: 1, colors: ['wood'] },
      { id: 'key-any#1', count: 1, colors: ['wood', 'green', 'bronze', 'silver', 'gold'] },
    ]);
  });

  it('two owed keys (the 2-keys token) resolve one at a time', () => {
    const base = newGame(2);
    const seat = base.activePlayerIndex;
    const withKeys: RussianRailroadsState = { ...base, pendingKey: { remaining: 2 } };
    const once = applyAction(withKeys, seatOf(withKeys).id, { type: 'RESOLVE_KEY', option: 'points' });
    expect(once.pendingKey).toEqual({ remaining: 1 }); // one still owed, turn kept
    expect(once.activePlayerIndex).toBe(seat);
  });
});

describe('bonus stars + route doubling — scoring (pg. 19)', () => {
  it('pg. 19 example (verbatim): Kyiv track on space 3 with a #3 loco scores 1+2+3 = 6', () => {
    const player: RussianRailroadsPlayer = { ...newGame(2).players[0]!, routes: [route('transsiberian', {}), route('stpetersburg', {}), route('kyiv', { 2: 'wood' })], locomotives: [{ number: 3, route: 'kyiv' }] };
    expect(bonusStarScore(player)).toBe(6);
  });

  it('bonus stars need the locomotive reach (no loco → no stars)', () => {
    const player: RussianRailroadsPlayer = { ...newGame(2).players[0]!, routes: [route('transsiberian', {}), route('stpetersburg', {}), route('kyiv', { 2: 'wood' })], locomotives: [] };
    expect(bonusStarScore(player)).toBe(0);
  });

  it('pg. 19: a green track + loco on St. Petersburg space 7 doubles that route', () => {
    const player: RussianRailroadsPlayer = { ...newGame(2).players[0]!, routes: [route('transsiberian', {}), route('stpetersburg', { 6: 'green' }), route('kyiv', {})], locomotives: [{ number: 7, route: 'stpetersburg' }] };
    expect(routeDoubled(player, 'stpetersburg')).toBe(true);
    expect(routeDoubled(player, 'kyiv')).toBe(false);
    // Score reflects the doubling: 7 green spaces × 1 = 7, doubled = 14.
    const s = scorePlayer(player);
    expect(s.routes).toBe(14);
  });

  it('the revalued tile scores tracks higher (pg. 46)', () => {
    const green = route('transsiberian', { 0: 'green' });
    const base: RussianRailroadsPlayer = { ...newGame(2).players[0]!, routes: [green, route('stpetersburg', {}), route('kyiv', {})], locomotives: [{ number: 1, route: 'transsiberian' }] };
    expect(scorePlayer(base).routes).toBe(1); // green = 1 on the base tile
    expect(scorePlayer({ ...base, revalued: true }).routes).toBe(2); // green = 2 revalued
  });

  it('the 20-point medal adds 20 each scoring phase (pg. 46)', () => {
    const base = newGame(2).players[0]!;
    expect(scorePlayer(base).bonus).toBe(0);
    expect(scorePlayer({ ...base, medal20: true }).bonus).toBe(20);
  });

  it('the second wrench adds a second industry score (pg. 47)', () => {
    const base = newGame(2).players[0]!;
    const two: RussianRailroadsPlayer = { ...base, industry: { wrench: 4, factories: [null, null, null, null, null], secondWrench: 2 } };
    // wrench on the 5-space (4→5 pts... wrench index 4 = 5 pts) + second wrench on space 2 (2 pts) = 7.
    expect(scorePlayer(two).industry).toBe(7);
  });
});

describe('idea-token spaces (pp. 18–19)', () => {
  it('reaching an idea-token space owes an idea-token choice (St. Petersburg space 4)', () => {
    const state = patch(newGame(2), {
      routes: [route('transsiberian', { 0: 'wood' }), route('stpetersburg', { 3: 'wood' }), route('kyiv', { 0: 'wood' })],
      locomotives: [{ number: 4, route: 'stpetersburg' }],
    });
    const seat = state.activePlayerIndex;
    const settled = settleSpecials(state, seat);
    expect(settled.held).toBe(true);
    expect(settled.changes.pendingIdeaToken).toEqual({ spaceId: 'stpetersburg-idea-4' });
  });

  it('the industry idea space fires when the wrench reaches its lane index (pg. 19)', () => {
    const state = patch(newGame(2), { industry: { wrench: 10, factories: [2, 2, 2, 2, 2], secondWrench: null } });
    const seat = state.activePlayerIndex;
    const settled = settleSpecials(state, seat);
    expect(settled.changes.pendingIdeaToken).toEqual({ spaceId: 'industry-idea' });
    // Already consumed → does not re-fire.
    const consumed = patch(state, { consumedSpecials: ['industry-idea'] });
    expect(settleSpecials(consumed, seat).held).toBe(false);
  });
});

describe('wood-worker idea card — passive move bonus (pg. 47)', () => {
  it('adds a move on a wood-specific space, not on an any-track space', () => {
    const base = newGame(2);
    const ww = patch(base, { woodWorker: true });
    // The 1-worker wood space normally grants 2 moves → 3 with the wood worker.
    const wood = place(ww, activeId(ww), 'track-wood-1');
    expect(wood.pendingMoves).toEqual({ remaining: 3, colors: ['wood'] });
    // The worker+coin space shows *any* track, so no bonus (still 2). Give the seat a coin to pay.
    const withCoin = patch(ww, { coins: 5 });
    const anyTrack = place(withCoin, activeId(withCoin), 'track-coin');
    expect(anyTrack.pendingMoves!.remaining).toBe(2);
  });
});
