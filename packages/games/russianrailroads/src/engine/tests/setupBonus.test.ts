import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../actions';
import type { RussianRailroadsState } from '../core';
import { expectError, newGameRaw } from './helpers';

const me = (s: RussianRailroadsState) => s.players[s.activePlayerIndex]!;

describe('starting-bonus setup mini-phase (pg. 6)', () => {
  it('opens the game with the last-position seat owing a card, blocking placement', () => {
    const s = newGameRaw(4);
    // 4th → 3rd → 2nd take a card; the start player (turn-order position 0) takes none.
    expect(s.pendingSetupBonus).toEqual([s.turnOrder[3], s.turnOrder[2], s.turnOrder[1]]);
    expect(s.activePlayerIndex).toBe(s.turnOrder[3]);
    // Placement (and everything but the setup resolution) is refused.
    expectError(() => applyAction(s, me(s).id, { type: 'PLACE', space: 'coins' }), 'SETUP_BONUS_PENDING');
    // legalActions offers only the starting bonus cards.
    expect(legalActions(s).every((a) => a.type === 'RESOLVE_SETUP_BONUS')).toBe(true);
  });

  it('resolves each seat in order, then opens round 1 with the start player', () => {
    let s = newGameRaw(3); // 2 non-start seats take a card
    expect(s.pendingSetupBonus).toHaveLength(2);
    // 3rd position takes coins.
    s = applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'start-coins-2' });
    expect(s.pendingSetupBonus).toHaveLength(1);
    // 2nd position takes the coin+wood card → opens a wood moves lock it must resolve.
    s = applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'start-coin-wood' });
    expect(s.pendingMoves).toEqual({ remaining: 1, colors: ['wood'] });
    s = applyAction(s, me(s).id, { type: 'MOVE_TRACK', route: 'transsiberian' });
    // Setup complete → round 1 placement opens with the start player.
    expect(s.pendingSetupBonus).toBeNull();
    expect(s.activePlayerIndex).toBe(s.turnOrder[0]);
  });

  it('the industry card advances the wrench', () => {
    let s = newGameRaw(2);
    const seat = s.activePlayerIndex;
    s = applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'start-industry-1' });
    expect(s.players[seat]!.industry.wrench).toBe(1);
    expect(s.pendingSetupBonus).toBeNull(); // 2-player: only one card, then round 1 opens
  });

  it('rejects an unknown starting bonus card', () => {
    const s = newGameRaw(2);
    expectError(() => applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'nope' }), 'UNKNOWN_SETUP_BONUS');
  });

  it('refuses RESOLVE_SETUP_BONUS once setup is done, and other actions during setup', () => {
    let s = newGameRaw(2);
    s = applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'start-coins-2' }); // setup done
    expectError(() => applyAction(s, me(s).id, { type: 'RESOLVE_SETUP_BONUS', card: 'start-coins-2' }), 'NO_PENDING_SETUP_BONUS');
  });
});
