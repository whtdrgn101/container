import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { RussianRailroadsState } from '../core';
import { expectError, newGame } from './helpers';

const seat = (s: RussianRailroadsState) => s.activePlayerIndex;
const me = (s: RussianRailroadsState) => s.players[s.activePlayerIndex]!;

/** A game whose active seat owes an idea-token choice. */
function owingIdeaToken(): RussianRailroadsState {
  return { ...newGame(2), pendingIdeaToken: { spaceId: 'stpetersburg-idea-4' } };
}
/** A game whose active seat owes an idea-card choice. */
function owingIdeaCard(): RussianRailroadsState {
  return { ...newGame(2), pendingIdeaCard: { owed: true } };
}

describe('idea tokens (pg. 46–47)', () => {
  it('twenty-points places the medal and is single-use', () => {
    const s = owingIdeaToken();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'twenty-points' });
    expect(after.players[seat(s)]!.medal20).toBe(true);
    expect(after.players[seat(s)]!.usedIdeaTokens).toEqual(['twenty-points']);
    expect(after.pendingIdeaToken).toBeNull();
    // Re-using a spent token is refused (same seat still owes a fresh idea-token choice).
    const again = { ...after, pendingIdeaToken: { spaceId: 'x' }, activePlayerIndex: seat(s) };
    expectError(() => applyAction(again, me(again).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'twenty-points' }), 'IDEA_TOKEN_UNAVAILABLE');
  });

  it('revaluation flips the valuation tile', () => {
    const s = owingIdeaToken();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'revaluation' });
    expect(after.players[seat(s)]!.revalued).toBe(true);
  });

  it('keys grants 2 keys and holds the turn for the key choices (pg. 19, 46)', () => {
    const s = owingIdeaToken();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'keys' });
    expect(after.players[seat(s)]!.keysReceived).toBe(2);
    expect(after.pendingKey).toEqual({ remaining: 2 });
    expect(after.pendingIdeaToken).toBeNull();
  });

  it('second-wrench places a second wrench and advances it 2 (pg. 47)', () => {
    const s = owingIdeaToken();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'second-wrench' });
    expect(after.players[seat(s)]!.industry.secondWrench).toBe(2);
  });

  it('end-bonus draws the top pile card and owes an idea-card choice (draw-top ruling)', () => {
    const s = owingIdeaToken();
    const pileBefore = s.endBonusPile.length;
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'end-bonus' });
    expect(after.players[seat(s)]!.endBonus).toEqual(s.endBonusPile[0]);
    expect(after.endBonusPile).toHaveLength(pileBefore - 1);
    expect(after.pendingIdeaCard).toEqual({ owed: true });
  });

  it('end-bonus with an empty pile draws nothing but still owes the idea card', () => {
    const s = { ...owingIdeaToken(), endBonusPile: [] };
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'end-bonus' });
    expect(after.players[seat(s)]!.endBonus).toBeNull();
    expect(after.pendingIdeaCard).toEqual({ owed: true });
  });
});

describe('idea cards (pg. 47)', () => {
  it('wood-worker grants a permanent worker + the passive flag', () => {
    const s = owingIdeaCard();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'wood-worker' });
    expect(after.players[seat(s)]!.woodWorker).toBe(true);
    expect(after.players[seat(s)]!.workersTotal).toBe(s.players[seat(s)]!.workersTotal + 1);
  });

  it('loco-9 opens the loco lock with a #9 (pg. 47)', () => {
    const s = owingIdeaCard();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'loco-9' });
    expect(after.pendingLoco).toEqual({ number: 9 });
    expect(after.pendingIdeaCard).toBeNull();
  });

  it('engineer-coin grants a coin; extra-coins grants two', () => {
    const s = owingIdeaCard();
    const c0 = s.players[seat(s)]!.coins;
    expect(applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'engineer-coin' }).players[seat(s)]!.coins).toBe(c0 + 1);
    expect(applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'extra-coins' }).players[seat(s)]!.coins).toBe(c0 + 2);
  });

  it('wood-move opens a wood moves lock (or forfeits if blocked)', () => {
    const s = owingIdeaCard();
    const after = applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'wood-move' });
    expect(after.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
    // Blocked (every route full of wood): no lock, just hands off.
    const full = {
      ...s,
      players: s.players.map((p, i) => (i === seat(s) ? { ...p, routes: p.routes.map((r) => ({ ...r, spaces: r.spaces.map(() => 'wood' as const) })), consumedSpecials: ['transsiberian-key-15', 'stpetersburg-key-9', 'kyiv-key-9', 'kyiv-worker-7'] } : p)),
    };
    const forfeit = applyAction(full, me(full).id, { type: 'RESOLVE_IDEA_CARD', card: 'wood-move' });
    expect(forfeit.pendingMoves).toBeNull();
  });

  it('rejects an unknown idea card', () => {
    const s = owingIdeaCard();
    // @ts-expect-error — exercising the runtime guard with a bad card id
    expectError(() => applyAction(s, me(s).id, { type: 'RESOLVE_IDEA_CARD', card: 'nope' }), 'UNKNOWN_IDEA_CARD');
  });
});

describe('idea gating (applyAction)', () => {
  it('refuses non-matching actions under each choice lock, and the resolutions with none pending', () => {
    const it0 = owingIdeaToken();
    expectError(() => applyAction(it0, me(it0).id, { type: 'PASS' }), 'IDEA_TOKEN_PENDING');
    const ic0 = owingIdeaCard();
    expectError(() => applyAction(ic0, me(ic0).id, { type: 'PASS' }), 'IDEA_CARD_PENDING');
    const key0: RussianRailroadsState = { ...newGame(2), pendingKey: { remaining: 1 } };
    expectError(() => applyAction(key0, me(key0).id, { type: 'PASS' }), 'KEY_PENDING');
    // With nothing pending, the resolutions are refused.
    const plain = newGame(2);
    expectError(() => applyAction(plain, me(plain).id, { type: 'RESOLVE_KEY', option: 'points' }), 'NO_PENDING_KEY');
    expectError(() => applyAction(plain, me(plain).id, { type: 'RESOLVE_IDEA_TOKEN', token: 'keys' }), 'NO_PENDING_IDEA_TOKEN');
    expectError(() => applyAction(plain, me(plain).id, { type: 'RESOLVE_IDEA_CARD', card: 'loco-9' }), 'NO_PENDING_IDEA_CARD');
    expectError(() => applyAction(plain, me(plain).id, { type: 'RESOLVE_REUSE', space: 'coins' }), 'NO_PENDING_REUSE');
  });

  it('legalActions enumerates each choice lock', () => {
    const key0: RussianRailroadsState = { ...newGame(2), pendingKey: { remaining: 1 } };
    expect(legalActions(key0)).toEqual([
      { type: 'RESOLVE_KEY', option: 'moves' },
      { type: 'RESOLVE_KEY', option: 'points' },
    ]);
    // Idea-token choices are the *unused* token types.
    const it0 = owingIdeaToken();
    expect(legalActions(it0).map((a) => (a.type === 'RESOLVE_IDEA_TOKEN' ? a.token : ''))).toEqual([
      'end-bonus',
      'twenty-points',
      'revaluation',
      'keys',
      'second-wrench',
    ]);
    const itUsed = { ...it0, players: it0.players.map((p, i) => (i === seat(it0) ? { ...p, usedIdeaTokens: ['keys' as const] } : p)) };
    expect(legalActions(itUsed).some((a) => a.type === 'RESOLVE_IDEA_TOKEN' && a.token === 'keys')).toBe(false);
    // Idea cards.
    const ic0 = owingIdeaCard();
    expect(legalActions(ic0)).toHaveLength(5);
  });
});
