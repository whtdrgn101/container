import { describe, expect, it } from 'vitest';
import { handCost, playFromHand } from '../actions';
import type { Card, PlayArea, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, expectError, makeState, newGame } from './helpers';

/** A game whose seat-0 player and/or board/phase are overridden. */
function game(seat0: Partial<StPetersburgPlayer> = {}, rest: Partial<StPetersburgState> = {}): StPetersburgState {
  const base = newGame(['Ann', 'Bob']);
  const players = base.players.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p));
  return makeState({ players, ...rest });
}

const emptyArea = (worker: Card[] = [], building: Card[] = [], aristocrat: Card[] = []): PlayArea => ({
  worker,
  building,
  aristocrat,
});
const lumberjacks = (n: number): Card[] =>
  Array.from({ length: n }, (_, i) => card({ id: `lj-${i}`, key: 'lumberjack' }));
const market = (id = 'mk-1'): Card =>
  card({ id, key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
const lumberjack = (id = 'lj-1'): Card =>
  card({ id, key: 'lumberjack', kind: 'worker', name: 'Lumberjack', cost: 3, ware: 'lumber' });
const tradingCard = (id = 'cw'): Card =>
  card({
    id,
    key: 'carpenterWorkshop',
    kind: 'trading',
    name: 'Carpenter Workshop',
    cost: 4,
    ware: 'lumber',
    tradingGroup: 'worker',
  });

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
    expect(after.log.at(-1)).toMatchObject({
      type: 'PLAY_FROM_HAND',
      playerId: 'p1',
      payload: { cardKey: 'market', cost: 5 },
    });
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

  it('plays a trading card from hand by displacing an owned card — no lower-row discount (pg. 7)', () => {
    // Carpenter Workshop (cost 4) held, displacing a placed Lumberjack (cost 3) → difference 1 ruble; a hand
    // card is in no row, so there is no −1 lower-row discount to apply.
    const before = game({ hand: [tradingCard('cw-hand')], playArea: emptyArea([lumberjack('lj-mine')]) });
    const after = playFromHand(before, 'p1', 0, 'lj-mine');
    expect(after.players[0]!.rubles).toBe(24); // 25 − 1
    expect(after.players[0]!.playArea.worker.map((c) => c.key)).toEqual(['carpenterWorkshop']);
    expect(after.players[0]!.hand).toHaveLength(0); // left the hand
    expect(after.board.discard).toBe(1); // the lumberjack was discarded
    expect(after.log.at(-1)).toMatchObject({
      type: 'PLAY_FROM_HAND',
      payload: { cardKey: 'carpenterWorkshop', cost: 1, displacedKey: 'lumberjack', displacedName: 'Lumberjack' },
    });
  });

  it('requires a target for a trading hand card, and rejects one on a non-trading card', () => {
    expectError(() => playFromHand(game({ hand: [tradingCard()] }), 'p1', 0), 'DISPLACE_REQUIRED');
    expectError(() => playFromHand(game({ hand: [market()] }), 'p1', 0, 'anything'), 'DISPLACE_NOT_ALLOWED');
  });

  it('rejects an illegal displacement target for a trading hand card (INVALID_DISPLACE_TARGET)', () => {
    // Nothing owned to displace.
    expectError(() => playFromHand(game({ hand: [tradingCard()] }), 'p1', 0, 'nope'), 'INVALID_DISPLACE_TARGET');
  });

  it('refuses a play the seat cannot afford (INSUFFICIENT_RUBLES)', () => {
    expectError(() => playFromHand(game({ hand: [market()], rubles: 2 }), 'p1', 0), 'INSUFFICIENT_RUBLES'); // market costs 5
  });

  it('rejects an out-of-range hand index (INVALID_CARD_SLOT)', () => {
    expectError(() => playFromHand(game({ hand: [market()] }), 'p1', 5), 'INVALID_CARD_SLOT');
    expectError(() => playFromHand(game({ hand: [] }), 'p1', 0), 'INVALID_CARD_SLOT'); // empty hand
  });
});
