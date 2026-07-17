import { SCORING_CARDS, applyAction } from '@container/engine/container';
import { describe, expect, it } from 'vitest';
import { rank } from '../policies/rank';
import { affordableContainers, producePlacements, repriceArrangement } from '../policies/pricing';
import { ctxFor, makeBank, makeGame, makePlayer, makeSupply, sc } from './helpers';

const CARD = SCORING_CARDS[0]!;
const others = () => [makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })];

describe('producePlacements', () => {
  it('produces one container per factory, priced to sell', () => {
    const state = makeGame([
      makePlayer({
        id: 'p1',
        factories: [
          { id: 'f1', color: 'white' },
          { id: 'f2', color: 'red' },
        ],
        factoryLimit: 4,
      }),
      ...others(),
    ]);
    const placements = producePlacements(ctxFor(state, 'p1'))!;
    expect(placements).toHaveLength(2);
    expect(placements.every((container) => container.price === 3)).toBe(true);
  });

  it('prices to move stock when short of cash', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 2, factoryLimit: 4 }), ...others()]);
    expect(producePlacements(ctxFor(state, 'p1'))![0]!.price).toBe(2);
  });

  it('declines when the factory district is full', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factoryLimit: 1, factoryStore: [sc('white', 2)] }),
      ...others(),
    ]);
    expect(producePlacements(ctxFor(state, 'p1'))).toBeNull();
  });

  it('prefers the colors the supply is deepest in', () => {
    // Draining a scarce color hurries the game-end clock (2 exhausted colors ends it).
    const state = makeGame(
      [
        makePlayer({
          id: 'p1',
          factories: [
            { id: 'f1', color: 'white' },
            { id: 'f2', color: 'red' },
          ],
          factoryLimit: 1,
        }),
        ...others(),
      ],
      { supply: makeSupply({ containers: { white: 1, red: 9, green: 10, blue: 10, yellow: 10 } }) },
    );
    expect(producePlacements(ctxFor(state, 'p1'))![0]!.color).toBe('red');
  });

  it('runs the factories the supply can still fill, skipping the exhausted ones', () => {
    const state = makeGame(
      [
        makePlayer({
          id: 'p1',
          factories: [
            { id: 'f1', color: 'white' },
            { id: 'f2', color: 'red' },
          ],
          factoryLimit: 4,
        }),
        ...others(),
      ],
      { supply: makeSupply({ containers: { white: 0, red: 9, green: 10, blue: 10, yellow: 10 } }) },
    );
    const placements = producePlacements(ctxFor(state, 'p1'))!;
    expect(placements.map((container) => container.color)).toEqual(['red']);
    expect(() => applyAction(state, 'p1', rank(ctxFor(state, 'p1'), { type: 'PRODUCE' })!.action)).not.toThrow();
  });

  it('declines when no factory color is left in the supply', () => {
    const state = makeGame(
      [makePlayer({ id: 'p1', factories: [{ id: 'f1', color: 'white' }], factoryLimit: 4 }), ...others()],
      { supply: makeSupply({ containers: { white: 0, red: 9, green: 10, blue: 10, yellow: 10 } }) },
    );
    expect(producePlacements(ctxFor(state, 'p1'))).toBeNull();
    expect(rank(ctxFor(state, 'p1'), { type: 'PRODUCE' })).toBeNull();
  });
});

describe('repriceArrangement', () => {
  it('declines when the district is already at the asking price', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 3)] }), ...others()]);
    expect(repriceArrangement(ctxFor(state, 'p1'), 'factory')).toBeNull();
  });

  it('declines an empty district', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(repriceArrangement(ctxFor(state, 'p1'), 'harbor')).toBeNull();
  });

  it('reprices to the asking price, keeping the same containers', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', factoryStore: [sc('white', 6), sc('red', 1)] }),
      ...others(),
    ]);
    const arrangement = repriceArrangement(ctxFor(state, 'p1'), 'factory')!;
    expect(arrangement).toEqual([sc('white', 3), sc('red', 3)]);
  });
});

describe('affordableContainers', () => {
  it('takes the cheapest first, within budget and room', () => {
    const offered = [sc('white', 5), sc('red', 1), sc('green', 2)];
    expect(affordableContainers(offered, 3, 5)).toEqual([sc('red', 1), sc('green', 2)]);
  });

  it('respects room even when cash is plentiful', () => {
    expect(affordableContainers([sc('white', 1), sc('red', 1)], 100, 1)).toHaveLength(1);
  });

  it('returns nothing when everything is too expensive', () => {
    expect(affordableContainers([sc('white', 5)], 1, 5)).toEqual([]);
  });
});

describe('trade policies', () => {
  it('buys an opponent factory stock only below its own resale price', () => {
    const cheap = makeGame([
      makePlayer({ id: 'p1', harborLimit: 2 }),
      makePlayer({ id: 'p2', factoryStore: [sc('white', 2)] }),
      makePlayer({ id: 'p3' }),
    ]);
    const bought = rank(ctxFor(cheap, 'p1'), { type: 'FACTORY_PURCHASE', sellerId: 'p2' });
    expect(bought).not.toBeNull();
    expect(bought!.action).toMatchObject({ bought: [sc('white', 2)] });

    const pricey = makeGame([
      makePlayer({ id: 'p1', harborLimit: 2 }),
      makePlayer({ id: 'p2', factoryStore: [sc('white', 6)] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(rank(ctxFor(pricey, 'p1'), { type: 'FACTORY_PURCHASE', sellerId: 'p2' })).toBeNull();
  });

  it('loads cargo only when the expected auction revenue beats the price', () => {
    const worth = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } }),
      makePlayer({ id: 'p2', harborStore: [sc('white', 2)] }),
      makePlayer({ id: 'p3' }),
    ]);
    const candidate = rank(ctxFor(worth, 'p1'), { type: 'HARBOR_PURCHASE' })!;
    expect(candidate.action).toMatchObject({ type: 'HARBOR_PURCHASE', bought: [sc('white', 2)] });
    expect(() => applyAction(worth, 'p1', candidate.action)).not.toThrow();

    const overpriced = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } }),
      makePlayer({ id: 'p2', harborStore: [sc('white', 7)] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(rank(ctxFor(overpriced, 'p1'), { type: 'HARBOR_PURCHASE' })).toBeNull();
  });

  it('declines a harbor purchase when not docked', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(rank(ctxFor(state, 'p1'), { type: 'HARBOR_PURCHASE' })).toBeNull();
  });
});

describe('voyage policies', () => {
  it('will not sail to the island empty', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(rank(ctxFor(state, 'p1'), { type: 'SAIL', to: { kind: 'island' } })).toBeNull();
  });

  it('wants the island more the fuller the hold', () => {
    const light = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'ocean' }, cargo: ['white'] } }),
      ...others(),
    ]);
    const heavy = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'ocean' }, cargo: ['white', 'red', 'green'] } }),
      ...others(),
    ]);
    const score = (state: ReturnType<typeof makeGame>) =>
      rank(ctxFor(state, 'p1'), { type: 'SAIL', to: { kind: 'island' } })!.score;
    expect(score(heavy)).toBeGreaterThan(score(light));
  });

  it('only sails to the bank to collect winnings', () => {
    const empty = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(rank(ctxFor(empty, 'p1'), { type: 'SAIL', to: { kind: 'bank' } })).toBeNull();

    const holding = makeGame([makePlayer({ id: 'p1', holdingArea: ['white'] }), ...others()]);
    expect(rank(ctxFor(holding, 'p1'), { type: 'SAIL', to: { kind: 'bank' } })).not.toBeNull();
  });

  it('will not sail to a harbor with nothing it can afford', () => {
    const bare = makeGame([makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(rank(ctxFor(bare, 'p1'), { type: 'SAIL', to: { kind: 'harbor', playerId: 'p2' } })).toBeNull();

    const broke = makeGame([
      makePlayer({ id: 'p1', money: 1 }),
      makePlayer({ id: 'p2', harborStore: [sc('white', 7)] }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(rank(ctxFor(broke, 'p1'), { type: 'SAIL', to: { kind: 'harbor', playerId: 'p2' } })).toBeNull();
  });

  it('sails back to the ocean rather than idling on a dock', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId: 'p2' }, cargo: [] } }),
      ...others(),
    ]);
    const candidate = rank(ctxFor(state, 'p1'), { type: 'SAIL', to: { kind: 'ocean' } })!;
    expect(candidate.score).toBeGreaterThan(0);
  });

  it('always collects containers already won at the bank', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', holdingArea: ['white'], ship: { location: { kind: 'bank' }, cargo: [] } }),
      ...others(),
    ]);
    expect(rank(ctxFor(state, 'p1'), { type: 'LOAD_FROM_BANK' })!.score).toBeGreaterThan(50);
  });
});

describe('bank policies', () => {
  it('opens a container-lot auction at the minimum bid', () => {
    const state = makeGame([makePlayer({ id: 'p1', scoringCard: CARD }), ...others()]);
    const candidate = rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 })!;
    expect(candidate.action).toMatchObject({ bid: 1 });
    expect(() => applyAction(state, 'p1', candidate.action)).not.toThrow();
  });

  it('outbids an existing auction by exactly one', () => {
    // Only the minimum needed to lead: you win at the start of your next turn if still leading, so
    // bidding higher buys no protection — just a worse price.
    const state = makeGame([makePlayer({ id: 'p1', scoringCard: CARD }), ...others()], {
      bank: makeBank({
        auctions: [{ lotKind: 'container', lotIndex: 0, highBidderId: 'p2', bid: 1, reserved: [] }],
      }),
    });
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 })!.action).toMatchObject(
      { bid: 2 },
    );
  });

  it('walks away once the price reaches what the lot is worth', () => {
    const state = makeGame([makePlayer({ id: 'p1', scoringCard: CARD }), ...others()], {
      bank: makeBank({
        auctions: [{ lotKind: 'container', lotIndex: 0, highBidderId: 'p2', bid: 4, reserved: [] }],
      }),
    });
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 })).toBeNull();
  });

  it('walks away from a lot it cannot afford', () => {
    const state = makeGame([makePlayer({ id: 'p1', money: 2, scoringCard: CARD }), ...others()], {
      bank: makeBank({
        auctions: [{ lotKind: 'container', lotIndex: 0, highBidderId: 'p2', bid: 40, reserved: [] }],
      }),
    });
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'container', lotIndex: 0 })).toBeNull();
  });

  it('declines an empty container lot', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'container', lotIndex: 2 })).toBeNull();
  });

  it('bids its cheapest factory stock for a cash lot', () => {
    // Factory containers score $0 at game end, harbor ones $2 — spend the factory stock first.
    const state = makeGame(
      [
        makePlayer({ id: 'p1', factoryStore: [sc('white', 1), sc('red', 5)], harborStore: [sc('green', 2)] }),
        ...others(),
      ],
      { bank: makeBank({ cashLots: [9, 2, 3] }) },
    );
    const candidate = rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 })!;
    expect(candidate.action).toMatchObject({ containerBid: [sc('white', 1)] });
    expect(() => applyAction(state, 'p1', candidate.action)).not.toThrow();
  });

  it('declines a cash lot worth less than the stock it costs', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 6)] }), ...others()], {
      bank: makeBank({ cashLots: [1, 2, 3] }),
    });
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 })).toBeNull();
  });

  it('declines a cash lot it has no containers to bid on', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [], harborStore: [] }), ...others()]);
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 })).toBeNull();
  });

  it('declines an empty cash lot', () => {
    const state = makeGame([makePlayer({ id: 'p1', factoryStore: [sc('white', 1)] }), ...others()], {
      bank: makeBank({ cashLots: [0, 2, 3] }),
    });
    expect(rank(ctxFor(state, 'p1'), { type: 'CALL_BANK', lotKind: 'cash', lotIndex: 0 })).toBeNull();
  });
});

describe('economy policies', () => {
  it('borrows only when cash-starved', () => {
    const rich = makeGame([makePlayer({ id: 'p1', money: 20 }), ...others()]);
    expect(rank(ctxFor(rich, 'p1'), { type: 'REQUEST_LOAN' })).toBeNull();

    const broke = makeGame([makePlayer({ id: 'p1', money: 1 }), ...others()]);
    expect(rank(ctxFor(broke, 'p1'), { type: 'REQUEST_LOAN' })).not.toBeNull();
  });

  it('repays only when comfortable', () => {
    const thin = makeGame([makePlayer({ id: 'p1', money: 11, loans: 1 }), ...others()]);
    expect(rank(ctxFor(thin, 'p1'), { type: 'REPAY_LOAN' })).toBeNull();

    const flush = makeGame([makePlayer({ id: 'p1', money: 30, loans: 1 }), ...others()]);
    expect(rank(ctxFor(flush, 'p1'), { type: 'REPAY_LOAN' })).not.toBeNull();
  });

  it('wants a warehouse only once the harbor is full', () => {
    const roomy = makeGame([makePlayer({ id: 'p1', harborLimit: 2, harborStore: [] }), ...others()]);
    const full = makeGame([
      makePlayer({ id: 'p1', harborLimit: 1, harborStore: [sc('white', 2)] }),
      ...others(),
    ]);
    const score = (state: ReturnType<typeof makeGame>) =>
      rank(ctxFor(state, 'p1'), { type: 'BUILD_WAREHOUSE' })!.score;
    expect(score(full)).toBeGreaterThan(score(roomy));
  });

  it('values early factories over a fourth one', () => {
    const early = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    const late = makeGame([
      makePlayer({
        id: 'p1',
        factories: [
          { id: 'f1', color: 'white' },
          { id: 'f2', color: 'red' },
          { id: 'f3', color: 'green' },
        ],
      }),
      ...others(),
    ]);
    const score = (state: ReturnType<typeof makeGame>) =>
      rank(ctxFor(state, 'p1'), { type: 'BUILD_FACTORY', color: 'blue' })!.score;
    expect(score(early)).toBeGreaterThan(score(late));
  });

  it('ranks END_TURN as the zero baseline', () => {
    const state = makeGame([makePlayer({ id: 'p1' }), ...others()]);
    expect(rank(ctxFor(state, 'p1'), { type: 'END_TURN' })).toEqual({ action: { type: 'END_TURN' }, score: 0 });
  });

  it('does not score DELIVER — it needs bids, not a ranking', () => {
    const state = makeGame([
      makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: ['white'] } }),
      ...others(),
    ]);
    expect(rank(ctxFor(state, 'p1'), { type: 'DELIVER' })).toBeNull();
  });
});
