import { describe, expect, it } from 'vitest';
import { addToHand } from '../actions';
import { HAND_LIMIT } from '../core';
import type { Board, Card, StPetersburgPlayer, StPetersburgState } from '../core';
import { card, expectError, makeState, newGame } from './helpers';

/** A game whose seat-0 player and/or board are overridden — the quick way to arrange an add fixture. */
function game(seat0: Partial<StPetersburgPlayer> = {}, board: Partial<Board> = {}): StPetersburgState {
  const base = newGame(['Ann', 'Bob']);
  const players = base.players.map((p, i) => (i === 0 ? { ...p, ...seat0 } : p));
  return makeState({ players, board: { ...base.board, ...board } });
}

/** `n` throwaway hand cards. */
const handCards = (n: number): Card[] => Array.from({ length: n }, (_, i) => card({ id: `h-${i}` }));

describe('addToHand (pg. 3)', () => {
  it('takes a card from a row into the hand for free, and passes the turn', () => {
    const before = newGame(['Ann', 'Bob']); // upper = 4 lumberjacks, active p1, 25 rubles
    const after = addToHand(before, 'p1', 'upper', 0);

    expect(after.players[0]!.hand.map((c) => c.key)).toEqual(['lumberjack']);
    expect(after.players[0]!.rubles).toBe(25); // free — no ruble change
    expect(after.board.upper).toHaveLength(3); // rows compact — the card is spliced out
    expect(after.activePlayerIndex).toBe(1); // turn passes clockwise
    expect(after.consecutivePasses).toBe(0); // an add is an action, resetting the pass counter
    expect(after.tookCardThisPhase).toBe(true); // a card left the board (pg. 8 refill will run)
    expect(after.version).toBe(1);
    expect(after.log.at(-1)).toMatchObject({
      type: 'ADD_TO_HAND',
      playerId: 'p1',
      // The take is public: the log NAMES the card (on the table everyone sees which card you take).
      payload: { cardKey: 'lumberjack', cardName: 'Lumberjack', row: 'upper' },
    });

    // The input is never mutated (engine purity).
    expect(before.players[0]!.hand).toHaveLength(0);
    expect(before.board.upper).toHaveLength(4);
  });

  it('takes from the lower row too', () => {
    const mkt = card({ id: 'mk', key: 'market', kind: 'building', name: 'Market' });
    const after = addToHand(game({}, { lower: [mkt] }), 'p1', 'lower', 0);
    expect(after.players[0]!.hand.map((c) => c.id)).toEqual(['mk']);
    expect(after.board.lower).toHaveLength(0);
  });

  it('allows a trading card into the hand — unlike buy, add-to-hand takes ANY card (pg. 3 wording)', () => {
    const tc = card({ id: 'cw', key: 'carpenterWorkshop', kind: 'trading', name: 'Carpenter Workshop', cost: 4 });
    const after = addToHand(game({}, { upper: [tc] }), 'p1', 'upper', 0);
    expect(after.players[0]!.hand.map((c) => c.kind)).toEqual(['trading']); // held, though it can't be PLAYED until SP4
  });

  it('rejects an add over the hand limit (HAND_FULL)', () => {
    expectError(() => addToHand(game({ hand: handCards(HAND_LIMIT) }), 'p1', 'upper', 0), 'HAND_FULL');
    // One below the limit is fine.
    const ok = addToHand(game({ hand: handCards(HAND_LIMIT - 1) }), 'p1', 'upper', 0);
    expect(ok.players[0]!.hand).toHaveLength(HAND_LIMIT);
  });

  it('rejects an empty or out-of-range slot (INVALID_CARD_SLOT)', () => {
    expectError(() => addToHand(newGame(), 'p1', 'upper', 99), 'INVALID_CARD_SLOT');
    expectError(() => addToHand(newGame(), 'p1', 'lower', 0), 'INVALID_CARD_SLOT'); // lower empty in round 1
  });
});
