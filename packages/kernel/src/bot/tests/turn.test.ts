import { describe, expect, it } from 'vitest';
import { BotError, assertBotTurn, type SeatedView } from '..';

/** A minimal view — `assertBotTurn` reads only these fields, structurally, from any game's view. */
const view = (over: Partial<SeatedView<{ id: string }>> = {}): SeatedView<{ id: string }> => ({
  id: 'g1',
  status: 'active',
  activePlayerIndex: 0,
  players: [{ id: 'p1' }, { id: 'p2' }],
  ...over,
});

describe('assertBotTurn', () => {
  it('returns the active player when it is that seat’s turn', () => {
    expect(assertBotTurn(view(), 'p1')).toEqual({ id: 'p1' });
    expect(assertBotTurn(view({ activePlayerIndex: 1 }), 'p2')).toEqual({ id: 'p2' });
  });

  it('throws for a finished game', () => {
    expect(() => assertBotTurn(view({ status: 'ended' }), 'p1')).toThrow(BotError);
    expect(() => assertBotTurn(view({ status: 'ended' }), 'p1')).toThrow(/has ended/);
  });

  it('throws when it is not the given seat’s turn', () => {
    expect(() => assertBotTurn(view(), 'p2')).toThrow(/not bot seat "p2"'s turn \(active seat is "p1"\)/);
  });

  it('names "none" when the active index is out of range', () => {
    expect(() => assertBotTurn(view({ activePlayerIndex: 9 }), 'p1')).toThrow(/active seat is "none"/);
  });
});
