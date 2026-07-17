import { SCORING_CARDS } from '@game-hub/engine/container';
import { describe, expect, it } from 'vitest';
import { bidFor, chooseTiedWinner, runoffBidFor, wantsBuyout } from '../bid';
import { BotError } from '../errors';
import { ctxFor, makeGame, makePlayer, viewOf } from './helpers';

const CARD = SCORING_CARDS[0]!; // white 10, green 5 (two-value), red 6, blue 4, yellow 2

const delivering = (cargo: ('white' | 'red' | 'green' | 'blue' | 'yellow')[], bidderMoney = 20) =>
  makeGame([
    makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo } }),
    makePlayer({ id: 'p2', money: bidderMoney, scoringCard: CARD, scoringArea: ['red'] }),
    makePlayer({ id: 'p3' }),
  ]);

describe('bidFor', () => {
  it('bids below its own valuation, so winning is profitable', () => {
    // Area is [red]; adding white+red makes red the discard and white scores $10.
    const state = delivering(['white', 'red']);
    const bid = bidFor(viewOf(state, 'p2'), 'p2');
    expect(bid).toBeGreaterThan(0);
    expect(bid).toBeLessThan(10);
  });

  it('bluffs $0 on cargo that is worthless to it', () => {
    // A lone container added to an empty area is its own most-common color, so it is discarded and
    // adds nothing. $0 is a legal bid, and the bluff falls out of the valuation rather than being
    // special-cased.
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['yellow'] } }),
      makePlayer({ id: 'p2', money: 20, scoringCard: CARD, scoringArea: [] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(bidFor(viewOf(state, 'p2'), 'p2')).toBe(0);
  });

  it('never bids more cash than it holds', () => {
    const state = delivering(['white', 'red'], 2);
    expect(bidFor(viewOf(state, 'p2'), 'p2')).toBeLessThanOrEqual(2);
  });

  it('never bids negative when cargo would hurt its score', () => {
    // Adding a second white flips white to the discard — a real loss (see valuation.test.ts).
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['white'] } }),
      makePlayer({ id: 'p2', scoringCard: CARD, scoringArea: ['white', 'red'] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(bidFor(viewOf(state, 'p2'), 'p2')).toBe(0);
  });

  it('refuses to bid in its own auction', () => {
    const state = delivering(['white']);
    expect(() => bidFor(viewOf(state, 'p1'), 'p1')).toThrow(/does not bid in its own auction/);
  });

  it('refuses when no delivery is open', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(() => bidFor(viewOf(state, 'p2'), 'p2')).toThrow(BotError);
  });
});

describe('wantsBuyout', () => {
  const deliverer = (cargo: ('white' | 'red')[], money: number) =>
    ctxFor(
      makeGame([
        makePlayer({
          id: 'p1',
          money,
          scoringCard: CARD,
          ship: { location: { kind: 'island' }, cargo },
        }),
        makePlayer({ id: 'p2' }),
        makePlayer({ id: 'p3' }),
      ]),
      'p1',
    );

  it('buys out when the cargo beats the bid plus subsidy', () => {
    // Cargo worth $10; a $1 bid means selling earns $2 but keeping nets $9.
    expect(wantsBuyout(deliverer(['white', 'red'], 20), 1)).toBe(true);
  });

  it('sells when the subsidy beats keeping the cargo', () => {
    expect(wantsBuyout(deliverer(['white', 'red'], 20), 9)).toBe(false);
  });

  it('cannot buy out what it cannot afford', () => {
    expect(wantsBuyout(deliverer(['white', 'red'], 0), 1)).toBe(false);
  });
});

describe('runoffBidFor', () => {
  const runoff = (area: ('white' | 'red')[], money = 20) =>
    makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['white', 'red'] } }),
      makePlayer({ id: 'p2', money, scoringCard: CARD, scoringArea: area }),
      makePlayer({ id: 'p3' }),
    ]);

  it('reaches nearer its true value than the opening bid did', () => {
    // A runoff means the shaded opening bid wasn't enough — the caution that made it profitable is
    // now the thing losing the cargo.
    const state = runoff(['red']);
    const opening = bidFor(viewOf(state, 'p2'), 'p2');
    const extra = runoffBidFor(viewOf(state, 'p2'), 'p2', opening);
    expect(extra).toBeGreaterThan(0);
    expect(opening + extra).toBeLessThan(10); // still under the $10 the cargo is worth to p2
  });

  it('adds nothing for cargo it does not want', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['white'] } }),
      makePlayer({ id: 'p2', scoringCard: CARD, scoringArea: [] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(runoffBidFor(viewOf(state, 'p2'), 'p2', 0)).toBe(0);
  });

  it('never commits more than it holds, counting the bid already on the table', () => {
    const state = runoff(['red'], 5);
    const extra = runoffBidFor(viewOf(state, 'p2'), 'p2', 4);
    expect(4 + extra).toBeLessThanOrEqual(5);
  });

  it('refuses when there is no active deliverer to bid against', () => {
    const state = { ...runoff(['red']), activePlayerIndex: 99 };
    expect(() => runoffBidFor(viewOf(state, 'p2'), 'p2', 0)).toThrow(BotError);
  });
});

describe('chooseTiedWinner', () => {
  it('hands the cargo to whoever it helps least', () => {
    // The containers must go to someone. p2's area already holds red+blue, so a white+green delivery
    // completes a spread for them; p3 has nothing, and a lone pair is worth far less.
    const ctx = ctxFor(
      makeGame([
        makePlayer({ id: 'p1', scoringCard: CARD, ship: { location: { kind: 'island' }, cargo: ['white', 'green'] } }),
        makePlayer({ id: 'p2', scoringArea: ['red', 'blue'] }),
        makePlayer({ id: 'p3', scoringArea: [] }),
      ]),
      'p1',
    );
    expect(chooseTiedWinner(ctx, ['p2', 'p3'], ['white', 'green'])).toBe('p3');
  });

  it('always returns one of the tied bidders', () => {
    const ctx = ctxFor(
      makeGame([
        makePlayer({ id: 'p1', scoringCard: CARD, ship: { location: { kind: 'island' }, cargo: ['white'] } }),
        makePlayer({ id: 'p2' }),
        makePlayer({ id: 'p3' }),
      ]),
      'p1',
    );
    expect(['p2', 'p3']).toContain(chooseTiedWinner(ctx, ['p2', 'p3'], ['white']));
  });

  it('ignores an id that is not a real opponent', () => {
    const ctx = ctxFor(
      makeGame([
        makePlayer({ id: 'p1', scoringCard: CARD, ship: { location: { kind: 'island' }, cargo: ['white'] } }),
        makePlayer({ id: 'p2' }),
        makePlayer({ id: 'p3' }),
      ]),
      'p1',
    );
    expect(chooseTiedWinner(ctx, ['ghost', 'p3'], ['white'])).toBe('p3');
  });
});
