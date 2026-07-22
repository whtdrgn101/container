import { describe, expect, it } from 'vitest';
import { handCost, playFromHand } from '../actions';
import type { Board, Card, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, expectError, makeState, newGame } from './helpers';

/** A game whose seat-0 player and/or board/phase are overridden. */
function game(seat0: Partial<StPetersburgPlayer> = {}, rest: Partial<StPetersburgState> = {}): StPetersburgState {
  const base = newGame(['Ann', 'Bob']);
  const players = base.players.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p));
  return makeState({ players, ...rest });
}

const emptyArea = (worker: Card[] = []): PlayArea => ({ worker, building: [], aristocrat: [] });
const lumberjacks = (n: number): Card[] => Array.from({ length: n }, (_, i) => card({ id: `lj-${i}`, key: 'lumberjack' }));
const market = (id = 'mk-1'): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
const tradingCard = (id = 'cw'): Card =>
  card({ id, key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });

describe('playFromHand (pg. 3)', () => {
  it('plays a hand card into the play area, charges its cost, and passes the turn', () => {
    const after = playFromHand(game({ hand: [market('mk-in-hand')] }), 'p1', 0);

    expect(after.players[0]!.playArea.building.map((c) => c.id)).toEqual(['mk-in-hand']);
    expect(after.players[0]!.hand).toHaveLength(0); // left the hand
    expect(after.players[0]!.rubles).toBe(20); // 25 − 5 (printed cost, no reductions)
    expect(after.activePlayerIndex).toBe(1); // turn passes
    expect(after.consecutivePasses).toBe(0); // a play is an action
    expect(after.tookCardThisPhase).toBe(false); // NOT set — the card came from the hand, not the board
    expect(after.version).toBe(1);
    expect(after.log.at(-1)).toMatchObject({ type: 'PLAY_FROM_HAND', playerId: 'p1', payload: { cardKey: 'market', cost: 5 } });
  });

  it('is playable in any phase (pg. 3 Remember: play any hand card in any phase)', () => {
    const after = playFromHand(game({ hand: [market()] }, { phase: 'aristocrat' }), 'p1', 0);
    expect(after.players[0]!.playArea.building).toHaveLength(1);
  });

  it('charges the base reductions but NOT the lower-row discount (a hand card is in no row)', () => {
    // Two lumberjacks owned → −2 same-name; a hand lumberjack (cost 3) costs max(1, 3−2) = 1.
    const player = { hand: [card({ key: 'lumberjack', cost: 3 })], playArea: emptyArea(lumberjacks(2)) };
    expect(handCost(player, player.hand[0]!)).toBe(1);
    const after = playFromHand(game({ hand: player.hand, playArea: emptyArea(lumberjacks(2)) }), 'p1', 0);
    expect(after.players[0]!.rubles).toBe(24); // 25 − 1
    expect(after.players[0]!.playArea.worker).toHaveLength(3);
  });

  it('refuses playing a trading card — needs displacement (TRADING_NOT_BUYABLE, SP4 seam); the card stays in hand', () => {
    const before = game({ hand: [tradingCard()] });
    expectError(() => playFromHand(before, 'p1', 0), 'TRADING_NOT_BUYABLE');
    // Not a wedge: passing is always legal and the stuck card is unchanged (SP6's −5 scores it).
    expect(before.players[0]!.hand).toHaveLength(1);
  });

  it('refuses a play the seat cannot afford (INSUFFICIENT_RUBLES)', () => {
    expectError(() => playFromHand(game({ hand: [market()], rubles: 2 }), 'p1', 0), 'INSUFFICIENT_RUBLES'); // market costs 5
  });

  it('rejects an out-of-range hand index (INVALID_CARD_SLOT)', () => {
    expectError(() => playFromHand(game({ hand: [market()] }), 'p1', 5), 'INVALID_CARD_SLOT');
    expectError(() => playFromHand(game({ hand: [] }), 'p1', 0), 'INVALID_CARD_SLOT'); // empty hand
  });
});
