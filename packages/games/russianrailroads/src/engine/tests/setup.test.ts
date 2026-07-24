import { describe, expect, it } from 'vitest';
import { dealEndBonusPile, dealEngineerStrip, dealTurnOrderCards, shuffle, turnOrderFromCards } from '../internal';
import { END_BONUS_CARDS, END_BONUS_REMOVED_UNSEEN, ENGINEER_DEAL } from '../core';
import { makeRng } from './helpers';

describe('setup deals', () => {
  it('shuffle returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, makeRng(3));
    expect(out).toHaveLength(5);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]); // untouched
  });

  it('deals one turn-order card per seat and derives play order', () => {
    const cards = dealTurnOrderCards(3, makeRng(2));
    expect(cards).toHaveLength(3);
    expect(new Set(cards).size).toBe(3);
    const order = turnOrderFromCards(cards);
    // The first seat in play order holds the lowest card.
    expect(cards[order[0]!]).toBe(Math.min(...cards));
  });

  it.each([
    [2, 6],
    [4, 7],
  ])('deals a %i-player engineer strip of the right length', (count, length) => {
    const strip = dealEngineerStrip(count, makeRng(5));
    expect(strip).toHaveLength(length);
    const filled = strip.filter((e) => e !== null);
    expect(filled).toHaveLength(ENGINEER_DEAL[count]!.a + ENGINEER_DEAL[count]!.b);
    // B engineers occupy the left of the strip, A engineers the right (the hiring end).
    expect(filled.every((e) => e!.stack === 'A' || e!.stack === 'B')).toBe(true);
  });

  it('leaves the left-most engineer slot empty at 3 players', () => {
    const strip = dealEngineerStrip(3, makeRng(5));
    expect(strip).toHaveLength(7);
    expect(strip[0]).toBeNull();
    expect(strip.slice(1).every((e) => e !== null)).toBe(true);
  });

  it('builds the end-bonus pile with two cards removed unseen', () => {
    const pile = dealEndBonusPile(makeRng(9));
    expect(pile).toHaveLength(END_BONUS_CARDS.length - END_BONUS_REMOVED_UNSEEN);
  });
});
