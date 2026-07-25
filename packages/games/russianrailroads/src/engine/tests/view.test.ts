import { describe, expect, it } from 'vitest';
import { viewFor } from '../view';
import { END_BONUS_CARDS } from '../core';
import type { RussianRailroadsState } from '../core';
import { newGame } from './helpers';

/** A game where p2 secretly holds an end-bonus card (RR1 never deals one, so we plant it for the test). */
function withSecret(count = 3): RussianRailroadsState {
  const state = newGame(count);
  return {
    ...state,
    players: state.players.map((p) => (p.id === 'p2' ? { ...p, endBonusCards: [END_BONUS_CARDS[0]!] } : p)),
  };
}

describe('viewFor', () => {
  it('shows the owner their own end-bonus card and hides an opponent’s', () => {
    const state = withSecret();
    const asP1 = viewFor(state, 'p1');
    const p2 = asP1.players.find((p) => p.id === 'p2')!;
    expect(p2.endBonusCards).toBeNull(); // redacted
    expect(p2.endBonusHeld).toBe(1); // but the count is public

    const asP2 = viewFor(state, 'p2');
    expect(asP2.players.find((p) => p.id === 'p2')!.endBonusCards).toEqual([END_BONUS_CARDS[0]]);
    // p2 sees p1's (empty) hand as a count too.
    expect(asP2.players.find((p) => p.id === 'p1')!.endBonusHeld).toBe(0);
  });

  it('carries the end-bonus pile as a count only — never its contents', () => {
    const state = newGame(4);
    const view = viewFor(state, 'p1') as Record<string, unknown>;
    expect(view['endBonusPileCount']).toBe(state.endBonusPile.length);
    expect(view['endBonusPile']).toBeUndefined(); // the secret pile order never reaches a client
  });

  it('honours a seat list and a spectator (null) viewer', () => {
    const state = withSecret(4);
    const asBoth = viewFor(state, ['p1', 'p2']);
    expect(asBoth.players.find((p) => p.id === 'p2')!.endBonusCards).toEqual([END_BONUS_CARDS[0]]);

    const asSpectator = viewFor(state, null);
    expect(asSpectator.players.find((p) => p.id === 'p2')!.endBonusCards).toBeNull();
    expect(asSpectator.viewerId).toBeNull();
  });

  it('projects the locomotive lock and the loco/factory supply publicly (pg. 10–12)', () => {
    const base = newGame(2);
    const state: RussianRailroadsState = { ...base, pendingLoco: { number: 4 } };
    const view = viewFor(state, 'p1');
    expect(view.pendingLoco).toEqual({ number: 4 }); // the held loco is public information
    expect(view.supplies.locomotives.stacks[2]).toBe(2); // the shared supply is public
    expect(view.supplies.locomotives.tens).toEqual([2, 2]);
  });

  it('reveals everything once the game has ended', () => {
    const secret = withSecret(2);
    const ended: RussianRailroadsState = { ...secret, status: 'ended', results: [], winnerIds: ['p1', 'p2'] };
    const asP1 = viewFor(ended, 'p1');
    // Even a non-owner sees p2's card at game end.
    expect(asP1.players.find((p) => p.id === 'p2')!.endBonusCards).toEqual([END_BONUS_CARDS[0]]);
  });

  it('survives a JSON round-trip with no secret leaking (the wire test)', () => {
    const state = withSecret(3);
    const wire = JSON.parse(JSON.stringify(viewFor(state, 'p1'))) as Record<string, unknown>;
    expect(wire['endBonusPile']).toBeUndefined();
    const players = wire['players'] as { id: string; endBonusCards: unknown }[];
    expect(players.find((p) => p.id === 'p2')!.endBonusCards).toBeNull();
    // The serialized payload is a faithful view (round counter etc. intact).
    expect(wire['round']).toBe(1);
    expect(wire['endBonusPileCount']).toBe(state.endBonusPile.length);
  });
});
