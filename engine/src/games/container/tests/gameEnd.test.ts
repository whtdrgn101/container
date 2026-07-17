import { describe, expect, it } from 'vitest';
import { applyAction, endGame, exhaustedColorCount, finalScoring, legalActions } from '../index';
import { expectError, makeBank, makeGame, makePlayer, makeSupply, sc } from './helpers';

// Default scoring card sc1: white $10, green two-value ($5 base), red $6, blue $4, yellow $2.

describe('final scoring', () => {
  it('scores nothing for an empty scoring area', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: [] })]);
    expect(score?.discardedColor).toBeNull();
    expect(score?.islandScore).toBe(0);
  });

  it('discards the most common color and scores the rest by the card', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: ['white', 'white', 'red', 'blue'] })]);
    expect(score?.discardedColor).toBe('white'); // 2 white
    expect(score?.islandScore).toBe(6 + 4); // red $6 + blue $4
  });

  it('on a non-two-value tie, discards the lowest-value tied color', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: ['white', 'white', 'yellow', 'yellow'] })]);
    expect(score?.discardedColor).toBe('yellow'); // keep the valuable $10 white
    expect(score?.islandScore).toBe(20);
  });

  it('must discard the two-value color when it ties for most common', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: ['green', 'green', 'white', 'white', 'red'] })]);
    expect(score?.discardedColor).toBe('green');
  });

  it('scores the two-value color at $10 when every color was collected', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: ['white', 'white', 'red', 'green', 'blue', 'yellow'] })]);
    expect(score?.discardedColor).toBe('white');
    expect(score?.islandScore).toBe(6 + 10 + 4 + 2); // red + green@$10 + blue + yellow
  });

  it('scores the two-value color at $5 when a color is missing', () => {
    const [score] = finalScoring([makePlayer({ id: 'p1', scoringArea: ['red', 'red', 'green', 'blue'] })]);
    expect(score?.discardedColor).toBe('red');
    expect(score?.islandScore).toBe(5 + 4); // green@$5 + blue$4
  });

  it('scores leftover containers and subtracts loan penalties', () => {
    const [score] = finalScoring([
      makePlayer({
        id: 'p1',
        money: 20,
        loans: 1,
        ship: { location: { kind: 'ocean' }, cargo: ['red', 'blue'] },
        holdingArea: ['green'],
        harborStore: [sc('white', 3), sc('yellow', 2)],
        factoryStore: [sc('blue', 2)],
      }),
    ]);
    expect(score?.leftover).toBe(3 * 3 + 2 * 2); // (2 cargo + 1 holding)*$3 + 2 harbor*$2 = $13
    expect(score?.loanPenalty).toBe(11);
    expect(score?.total).toBe(20 + 0 + 13 - 11); // = 22
  });
});

describe('winner determination', () => {
  it('picks the highest total', () => {
    const players = [makePlayer({ id: 'p1', money: 30 }), makePlayer({ id: 'p2', money: 20 }), makePlayer({ id: 'p3', money: 10 })];
    const { extra } = endGame(makeGame(players), players, makeBank());
    expect(extra.status).toBe('ended');
    expect(extra.winnerIds).toEqual(['p1']);
    expect(extra.results).toHaveLength(3);
  });

  it('breaks a tie by factory-district containers', () => {
    const players = [
      makePlayer({ id: 'p1', money: 20, factoryStore: [sc('red', 2)] }),
      makePlayer({ id: 'p2', money: 20 }),
      makePlayer({ id: 'p3', money: 10 }),
    ];
    expect(endGame(makeGame(players), players, makeBank()).extra.winnerIds).toEqual(['p1']);
  });

  it('shares victory when still tied after the factory tiebreak', () => {
    const players = [makePlayer({ id: 'p1', money: 20 }), makePlayer({ id: 'p2', money: 20 }), makePlayer({ id: 'p3', money: 10 })];
    expect(endGame(makeGame(players), players, makeBank()).extra.winnerIds).toEqual(['p1', 'p2']);
  });

  it('awards open Bank auctions to their high bidder before scoring', () => {
    const bank = makeBank({
      tokens: 0,
      containerLots: [['red', 'blue'], [], []],
      auctions: [{ lotKind: 'container', lotIndex: 0, highBidderId: 'p2', bid: 3, reserved: [] }],
    });
    const players = [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', money: 20 }), makePlayer({ id: 'p3' })];
    const { players: resolved } = endGame(makeGame(players, { bank }), players, bank);
    expect(resolved.find((p) => p.id === 'p2')?.holdingArea).toEqual(['red', 'blue']);
  });
});

describe('game end trigger', () => {
  it('counts exhausted supply colors', () => {
    expect(exhaustedColorCount(makeSupply({ containers: { white: 0, red: 0, green: 5, blue: 5, yellow: 5 } }))).toBe(2);
    expect(exhaustedColorCount(makeSupply())).toBe(0);
  });

  it('ends the game when a second color is exhausted, then scores', () => {
    const supply = makeSupply({ containers: { white: 0, red: 1, green: 5, blue: 5, yellow: 5 } });
    const p1 = makePlayer({ id: 'p1', factories: [{ id: 'p1-f1', color: 'red' }], factoryStore: [], factoryLimit: 2, money: 30 });
    let state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })], { supply });

    state = applyAction(state, 'p1', { type: 'PRODUCE' }); // red supply 1 → 0 (2 colors gone)
    expect(state.supply.containers.red).toBe(0);
    expect(state.status).toBe('active'); // active until the turn ends

    state = applyAction(state, 'p1', { type: 'END_TURN' });
    expect(state.status).toBe('ended');
    expect(state.winnerIds).toEqual(['p1']); // $29 after the $1 wage vs $21 / $20
    expect(state.results).toHaveLength(3);

    expectError(() => applyAction(state, 'p2', { type: 'PRODUCE' }), 'GAME_OVER');
    expect(legalActions(state)).toEqual([]);
  });
});
