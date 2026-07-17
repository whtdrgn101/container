import { SCORING_CARDS, viewFor } from '@game-hub/engine/container';
import { describe, expect, it } from 'vitest';
import { BotError } from '../errors';
import { AVERAGE_COLOR_VALUE, expectedAuctionBid, gainFrom, islandScore, selfOf } from '../valuation';
import { ctxFor, makeGame, makePlayer, newGame } from './helpers';

// sc1: white 10, green 5 (two-value), red 6, blue 4, yellow 2.
const CARD = SCORING_CARDS[0]!;

describe('selfOf', () => {
  it('returns the bot own seat with its card visible', () => {
    const state = newGame(3);
    const me = selfOf(viewFor(state, 'p2'), 'p2');
    expect(me.id).toBe('p2');
    expect(me.scoringCard).not.toBeNull();
  });

  it('rejects a seat that is not in the game', () => {
    const state = newGame(3);
    expect(() => selfOf(viewFor(state, 'p1'), 'p9')).toThrow(BotError);
  });

  it('rejects a view where the bot cannot see its own card', () => {
    // This is the contract that keeps bots honest: a bot must be handed *its own* view. A spectator
    // view (or another seat's) hides its card, and every valuation would silently be wrong.
    const state = newGame(3);
    expect(() => selfOf(viewFor(state, null), 'p1')).toThrow(/cannot see its own scoring card/);
    expect(() => selfOf(viewFor(state, 'p2'), 'p1')).toThrow(BotError);
  });
});

describe('islandScore', () => {
  it('scores by the engine rules, discarding the most-common color', () => {
    const me = makePlayer({ id: 'p1', scoringCard: CARD });
    // white x2 + red: white is most common and discarded, leaving red at $6.
    expect(islandScore(me, ['white', 'white', 'red'])).toBe(6);
  });

  it('is zero for an empty area', () => {
    expect(islandScore(makePlayer({ id: 'p1', scoringCard: CARD }), [])).toBe(0);
  });
});

describe('gainFrom', () => {
  it('values a container by what it actually adds, not its face value', () => {
    // The whole reason valuation delegates to the engine. Area is white+red (red is discarded, white
    // scores $10). A second white makes *white* the most-common color, so the $10 container becomes
    // the discard and red scores $6 instead — the gain is NEGATIVE. A bot valuing containers with a
    // naive `card.values[color]` would price this at +$10 and wildly overbid.
    const me = makePlayer({ id: 'p1', scoringCard: CARD, scoringArea: ['white', 'red'] });
    expect(gainFrom(me, ['white'])).toBe(-4);
    expect(gainFrom(me, ['red'])).toBe(0);
  });

  it('values a lone container at nothing — it is its own discard', () => {
    const me = makePlayer({ id: 'p1', scoringCard: CARD, scoringArea: [] });
    expect(gainFrom(me, ['white'])).toBe(0);
    expect(gainFrom(me, ['white', 'red'])).toBe(10); // red discarded, white scores $10
  });
});

describe('AVERAGE_COLOR_VALUE', () => {
  it('is derived from the real deck, not hardcoded', () => {
    // Every card is 10/5/6/4/2 = $27 across 5 colors.
    expect(AVERAGE_COLOR_VALUE).toBeCloseTo(27 / 5);
  });
});

describe('expectedAuctionBid', () => {
  const table = (opponent: Partial<Parameters<typeof makePlayer>[0]> = {}) =>
    ctxFor(
      makeGame([
        makePlayer({ id: 'p1', scoringCard: CARD }),
        makePlayer({ ...opponent, id: 'p2' }),
        makePlayer({ id: 'p3', money: 0, scoringArea: [] }),
      ]),
      'p1',
    );

  it('is zero for no cargo', () => {
    expect(expectedAuctionBid(table(), [])).toBe(0);
  });

  it('expects more for cargo that fits an opponent visible area', () => {
    // Areas are public — only the card is secret. An opponent already holding red will pay more for
    // a mixed hold than one holding nothing, because a lone color is its own discard.
    const withArea = expectedAuctionBid(table({ scoringArea: ['red', 'blue'] }), ['white', 'green']);
    const empty = expectedAuctionBid(table({ scoringArea: [] }), ['white']);
    expect(withArea).toBeGreaterThan(empty);
  });

  it('never expects more than an opponent can actually pay', () => {
    // Cash is public too, so a broke table cannot bid however much it likes.
    expect(expectedAuctionBid(table({ money: 1, scoringArea: ['red', 'blue'] }), ['white', 'green'])).toBeLessThanOrEqual(1);
  });

  it('excludes cards the bot holds itself', () => {
    // The bot knows nobody else has its card, so that card must not enter the average. sc1 is the
    // only card valuing white at $10; excluding it must lower the estimate for a white-heavy hold.
    const asIs = expectedAuctionBid(table({ scoringArea: ['red'] }), ['white', 'blue']);
    const holdingOther = ctxFor(
      makeGame([
        makePlayer({ id: 'p1', scoringCard: SCORING_CARDS[1]! }),
        makePlayer({ id: 'p2', scoringArea: ['red'] }),
        makePlayer({ id: 'p3', money: 0 }),
      ]),
      'p1',
    );
    expect(expectedAuctionBid(holdingOther, ['white', 'blue'])).toBeGreaterThan(asIs);
  });
});

describe('game-state independence', () => {
  it('does not mutate the player it values', () => {
    const me = makePlayer({ id: 'p1', scoringCard: CARD, scoringArea: ['white'] });
    const game = makeGame([me]);
    gainFrom(me, ['red', 'green']);
    expect(me.scoringArea).toEqual(['white']);
    expect(game.players[0]!.scoringArea).toEqual(['white']);
  });
});
