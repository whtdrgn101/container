import { describe, expect, it } from 'vitest';
import type { Color, PlayerState } from '../index';
import { ACTIONS_PER_TURN, deliver, getPlayer, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, newGame } from './helpers';

const atIsland = (cargo: Color[]) =>
  makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo } });

const three = (p1: PlayerState, p2: PlayerState, p3: PlayerState) => makeGame([p1, p2, p3]);

describe('deliver', () => {
  it('awards cargo to the highest bidder and pays the deliverer double', () => {
    const state = three(atIsland(['red', 'blue']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { p2: 5, p3: 3 });

    // p2 wins with $5: pays $5 and takes both containers to their scoring area.
    expect(getPlayer(next, 'p2').money).toBe(5);
    expect(getPlayer(next, 'p2').scoringArea).toEqual(['red', 'blue']);
    // Deliverer earns bid + matching subsidy = $10; ship is emptied.
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + 10);
    expect(getPlayer(next, 'p1').ship.cargo).toEqual([]);
    // Losing bidder is untouched.
    expect(getPlayer(next, 'p3').money).toBe(10);
    // Turn passes on.
    expect(next.activePlayerIndex).toBe(1);
    expect(next.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(next.log.at(-1)).toMatchObject({ type: 'DELIVER', playerId: 'p1', payload: { winnerId: 'p2', winningBid: 5 } });
  });

  it('breaks ties by seat order (earliest opponent wins)', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { p2: 4, p3: 4 });
    expect(getPlayer(next, 'p2').scoringArea).toEqual(['green']);
    expect(getPlayer(next, 'p3').scoringArea).toEqual([]);
  });

  it('allows an all-$0 (bluff) auction — the earliest opponent wins for free', () => {
    const state = three(atIsland(['white']), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' }));
    const next = deliver(state, 'p1', {}); // no bids → everyone at $0
    expect(getPlayer(next, 'p2').scoringArea).toEqual(['white']);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY);
  });

  it('rejects delivering when the ship is not at the island', () => {
    expectError(() => deliver(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })), 'p1', {}), 'INVALID_DELIVERY');
  });

  it('rejects delivering with an empty ship', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: [] } });
    expectError(() => deliver(three(p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })), 'p1', {}), 'INVALID_DELIVERY');
  });

  it('rejects a negative bid', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' }));
    expectError(() => deliver(state, 'p1', { p2: -1 }), 'INVALID_SELECTION');
  });

  it('rejects a bid larger than the bidder can pay', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 3 }), makePlayer({ id: 'p3' }));
    expectError(() => deliver(state, 'p1', { p2: 5 }), 'INSUFFICIENT_FUNDS');
  });

  it('rejects an unknown deliverer', () => {
    expectError(() => deliver(newGame(3), 'ghost', {}), 'PLAYER_NOT_FOUND');
  });
});
