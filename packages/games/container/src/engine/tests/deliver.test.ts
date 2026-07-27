import { describe, expect, it } from 'vitest';
import type { Color, PlayerState } from '../index';
import { ACTIONS_PER_TURN, deliver, getPlayer, STARTING_MONEY } from '../index';
import { expectError, makeGame, makePlayer, newGame } from './helpers';

const atIsland = (cargo: Color[]) => makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo } });

const three = (p1: PlayerState, p2: PlayerState, p3: PlayerState) => makeGame([p1, p2, p3]);

describe('deliver', () => {
  it('awards cargo to the highest bidder and pays the deliverer double', () => {
    const state = three(
      atIsland(['red', 'blue']),
      makePlayer({ id: 'p2', money: 10 }),
      makePlayer({ id: 'p3', money: 10 }),
    );
    const next = deliver(state, 'p1', { bids: { p2: 5, p3: 3 } });

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
    expect(next.log.at(-1)).toMatchObject({
      type: 'DELIVER',
      playerId: 'p1',
      payload: { winnerId: 'p2', winningBid: 5 },
    });
  });

  // Rulebook pg. 16: "If there is still a tie after a runoff auction, the player delivering
  // containers chooses which tied bidder wins." The engine used to hand the cargo to the earliest
  // seat, which quietly decided a real strategic choice on the deliverer's behalf.
  // The move log is public — `viewFor` passes it to every client untouched — so what goes in it is a
  // privacy decision, not just bookkeeping. Only the *winning* bid is recorded; the losing bids were
  // sealed and are returned to hand, so they must never be written down. Asserting the payload
  // exactly (rather than a subset) is the guard: adding `bids` here would fail this test.
  it('records only the winning bid — losing bids never reach the public log', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { bids: { p2: 7, p3: 3 } });
    expect(next.log.at(-1)).toEqual({
      seq: 1,
      type: 'DELIVER',
      playerId: 'p1',
      payload: { winnerId: 'p2', winningBid: 7, buyout: false, containers: ['red'] },
    });
  });

  it('records only the price on a buyout, not who bid what', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { bids: { p2: 6, p3: 2 }, buyout: true });
    expect(next.log.at(-1)!.payload).toEqual({
      winnerId: 'p1',
      winningBid: 6,
      buyout: true,
      containers: ['red'],
    });
  });

  it('demands the deliverer break a tie that a runoff did not settle', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    expectError(() => deliver(state, 'p1', { bids: { p2: 4, p3: 4 } }), 'CHOICE_REQUIRED');
  });

  it('gives the cargo to the tied bidder the deliverer picks', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, chosenWinnerId: 'p3' });
    expect(getPlayer(next, 'p3').scoringArea).toEqual(['green']); // not the earliest seat
    expect(getPlayer(next, 'p2').scoringArea).toEqual([]);
    expect(getPlayer(next, 'p3').money).toBe(10 - 4);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + 8); // bid + matching subsidy
  });

  it('rejects a chosen winner who is not among the tied bidders', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 3 }));
    // p3 bid less, so they never tied for the highest — they cannot be handed the cargo.
    expectError(() => deliver(state, 'p1', { bids: { p2: 4, p3: 1 }, chosenWinnerId: 'p3' }), 'INVALID_SELECTION');
  });

  it('counts a runoff bid on top of an unrecorded $0 bluff', () => {
    // Everyone bluffed $0 (no entry at all), so they tie — and a runoff bid is measured against the
    // bidder's whole hand, since their "opening bid" was nothing.
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 4 }), makePlayer({ id: 'p3', money: 4 }));
    expectError(() => deliver(state, 'p1', { bids: {}, runoffBids: { p3: 9 } }), 'INSUFFICIENT_FUNDS');

    const next = deliver(state, 'p1', { bids: {}, runoffBids: { p3: 4 } });
    expect(getPlayer(next, 'p3').scoringArea).toEqual(['red']); // outbid the $0 bluffers
    expect(getPlayer(next, 'p3').money).toBe(0);
  });

  it('needs no choice on a buyout — a tie has no winner to pick', () => {
    // pg. 16: "If they buy out the auction, all tied bidders return their bids." Nobody takes the
    // cargo but the deliverer, so a still-tied runoff simply sets the price.
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    const next = deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, buyout: true });
    expect(getPlayer(next, 'p1').scoringArea).toEqual(['green']);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY - 4); // paid the tied bid to the Bank
    expect(getPlayer(next, 'p2').money).toBe(10); // bids returned
    expect(getPlayer(next, 'p3').money).toBe(10);
  });

  it('rejects a chosen winner on a buyout', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    expectError(
      () => deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, buyout: true, chosenWinnerId: 'p2' }),
      'INVALID_SELECTION',
    );
  });

  it('rejects choosing a bidder who lost the runoff', () => {
    // p2 and p3 tie for the lead; p4 is out of contention, so the deliverer cannot gift them the cargo.
    const state = makeGame([
      atIsland(['green']),
      makePlayer({ id: 'p2', money: 10 }),
      makePlayer({ id: 'p3', money: 10 }),
      makePlayer({ id: 'p4', money: 10 }),
    ]);
    expectError(
      () => deliver(state, 'p1', { bids: { p2: 4, p3: 4, p4: 1 }, chosenWinnerId: 'p4' }),
      'INVALID_SELECTION',
    );
  });

  it('rejects a chosen winner when nothing is tied', () => {
    const state = three(atIsland(['green']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    expectError(() => deliver(state, 'p1', { bids: { p2: 5, p3: 1 }, chosenWinnerId: 'p2' }), 'INVALID_SELECTION');
  });

  it('treats an all-$0 bluff auction as a tie the deliverer must break', () => {
    // Everyone bluffing $0 still "ties for the highest bid" — so it is a real choice, not a freebie
    // for whoever happens to sit earliest.
    const state = three(atIsland(['white']), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' }));
    expectError(() => deliver(state, 'p1', { bids: {} }), 'CHOICE_REQUIRED');

    const next = deliver(state, 'p1', { bids: {}, chosenWinnerId: 'p3' });
    expect(getPlayer(next, 'p3').scoringArea).toEqual(['white']);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY); // $0 bid, $0 subsidy
  });

  it('rejects delivering when the ship is not at the island', () => {
    expectError(
      () =>
        deliver(three(makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })), 'p1', {
          bids: {},
        }),
      'INVALID_DELIVERY',
    );
  });

  it('rejects delivering with an empty ship', () => {
    const p1 = makePlayer({ id: 'p1', ship: { location: { kind: 'island' }, cargo: [] } });
    expectError(
      () => deliver(three(p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })), 'p1', { bids: {} }),
      'INVALID_DELIVERY',
    );
  });

  it('rejects a negative bid', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' }));
    expectError(() => deliver(state, 'p1', { bids: { p2: -1 } }), 'INVALID_SELECTION');
  });

  it('rejects a bid larger than the bidder can pay', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 3 }), makePlayer({ id: 'p3' }));
    expectError(() => deliver(state, 'p1', { bids: { p2: 5 } }), 'INSUFFICIENT_FUNDS');
  });

  it('rejects an unknown deliverer', () => {
    expectError(() => deliver(newGame(3), 'ghost', { bids: {} }), 'PLAYER_NOT_FOUND');
  });

  it('resolves a tie with a runoff auction (highest total wins)', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    // Both bid $4 (tie). In the runoff p3 adds $2 → p3 wins with a total of $6.
    const next = deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, runoffBids: { p2: 0, p3: 2 } });
    expect(getPlayer(next, 'p3').scoringArea).toEqual(['red']);
    expect(getPlayer(next, 'p3').money).toBe(10 - 6);
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY + 12); // $6 bid + $6 subsidy
    expect(getPlayer(next, 'p2').money).toBe(10); // lost, untouched
  });

  it('rejects a negative runoff bid', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    expectError(() => deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, runoffBids: { p3: -1 } }), 'INVALID_SELECTION');
  });

  it('rejects a runoff bid the player cannot afford', () => {
    const state = three(atIsland(['red']), makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 5 }));
    // p3: initial $4 + runoff $3 = $7 total > $5 on hand.
    expectError(() => deliver(state, 'p1', { bids: { p2: 4, p3: 4 }, runoffBids: { p3: 3 } }), 'INSUFFICIENT_FUNDS');
  });

  it('lets the deliverer buy out the auction and keep the containers', () => {
    const state = three(
      atIsland(['red', 'green']),
      makePlayer({ id: 'p2', money: 10 }),
      makePlayer({ id: 'p3', money: 10 }),
    );
    const next = deliver(state, 'p1', { bids: { p2: 5, p3: 3 }, buyout: true }); // highest bid is $5 → buyout costs $5
    expect(getPlayer(next, 'p1').scoringArea).toEqual(['red', 'green']); // deliverer keeps them
    expect(getPlayer(next, 'p1').money).toBe(STARTING_MONEY - 5); // paid buyout, no subsidy
    expect(getPlayer(next, 'p1').ship.cargo).toEqual([]);
    expect(getPlayer(next, 'p2').money).toBe(10); // the bidder pays nothing on a buyout
    expect(next.log.at(-1)).toMatchObject({
      type: 'DELIVER',
      payload: { winnerId: 'p1', winningBid: 5, buyout: true },
    });
  });

  it('rejects a buyout the deliverer cannot afford', () => {
    const p1 = makePlayer({ id: 'p1', money: 3, ship: { location: { kind: 'island' }, cargo: ['red'] } });
    const state = three(p1, makePlayer({ id: 'p2', money: 10 }), makePlayer({ id: 'p3', money: 10 }));
    expectError(() => deliver(state, 'p1', { bids: { p2: 5 }, buyout: true }), 'INSUFFICIENT_FUNDS');
  });
});
