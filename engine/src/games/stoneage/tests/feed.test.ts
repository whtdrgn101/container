import { describe, expect, it } from 'vitest';
import type { StoneAgePlayer, StoneAgeState } from '../core';
import { feed } from '../actions';
import { makeState } from './helpers';

/** A feeding-phase game whose active player (seat 0) is overridden with the given board. */
function feeding(p1: Partial<StoneAgePlayer>, overrides: Partial<StoneAgeState> = {}): StoneAgeState {
  const base = makeState({ phase: 'feeding', activePlayerIndex: 0, startPlayerIndex: 0, ...overrides });
  return { ...base, players: base.players.map((p, i) => (i === 0 ? { ...p, ...p1 } : p)) };
}

describe('feed', () => {
  it('takes food-track production, then pays 1 food per person, keeping the surplus', () => {
    // 12 food + 2 track = 14 produced; 5 people → 5 paid → 9 left.
    const next = feed(feeding({ food: 12, foodTrack: 2, people: 5 }), 'p1');
    expect(next.players[0]!.food).toBe(9);
    expect(next.activePlayerIndex).toBe(1); // Bob is up to feed
    expect(next.log.at(-1)).toMatchObject({ type: 'FEED', payload: { need: 5, paidFood: 5 } });
  });

  it('covers a shortfall with resources, spending the least valuable first', () => {
    // 2 food, 5 people → short 3. wood(1) then brick(2) cover it; stone/gold untouched.
    const next = feed(feeding({ food: 2, foodTrack: 0, people: 5, resources: { wood: 1, brick: 5, stone: 0, gold: 2 } }), 'p1');
    expect(next.players[0]!.food).toBe(0);
    expect(next.players[0]!.resources).toEqual({ wood: 0, brick: 3, stone: 0, gold: 2 });
    expect(next.log.at(-1)).toMatchObject({ payload: { paidFood: 2, paidResources: 3 } });
  });

  it('takes the −10 penalty (and loses all food) when it cannot pay the shortfall', () => {
    const next = feed(feeding({ food: 1, foodTrack: 0, people: 5, score: 15, resources: { wood: 1, brick: 0, stone: 0, gold: 0 } }), 'p1');
    expect(next.players[0]!.food).toBe(0);
    expect(next.players[0]!.resources.wood).toBe(1); // resources kept — partial payment doesn't help
    expect(next.players[0]!.score).toBe(5);
    expect(next.log.at(-1)).toMatchObject({ payload: { starved: 4, penalty: 10 } });
  });

  it('takes the penalty when the player declines to pay (payWithResources = false)', () => {
    const next = feed(feeding({ food: 2, foodTrack: 0, people: 5, score: 4, resources: { wood: 9, brick: 0, stone: 0, gold: 0 } }), 'p1', false);
    expect(next.players[0]!.resources.wood).toBe(9); // not spent
    expect(next.players[0]!.score).toBe(0); // max(0, 4 − 10)
  });

  it('rolls the round over once the last player has fed, resetting used tools', () => {
    // Bob (seat 1) is the last feeder; feeding him wraps back to the start player → new round.
    const base = feeding({ tools: [1, 2], toolsUsed: [true, true] }, { activePlayerIndex: 1, startPlayerIndex: 0 });
    const next = feed(base, 'p2');
    expect(next.players[0]!.toolsUsed).toEqual([false, false]); // tools flip back to unused (SA4b)
    expect(next.cardDisplay).toHaveLength(4); // the card display is resupplied for the new round (SA10)
    expect(next.status).toBe('active'); // no game-end trigger → the round rolls over
    expect(next.round).toBe(2);
    expect(next.phase).toBe('placement');
    expect(next.startPlayerIndex).toBe(1); // marker passed one seat left
    expect(next.activePlayerIndex).toBe(1);
    expect(next.placements.forest).toEqual({}); // board cleared for the new round
    expect(next.placements.building1).toEqual({}); // building slots survive the reset (not just fixed places)
  });

  it('ends the game at the round transition when a building stack is empty (SA11)', () => {
    // Last feeder; one building stack has been emptied → final scoring instead of a new round.
    const base = feeding({}, { activePlayerIndex: 1, startPlayerIndex: 0 });
    const next = feed({ ...base, buildings: [[], base.buildings[1]!] }, 'p2');
    expect(next.status).toBe('ended');
    expect(next.results).not.toBeNull();
    expect(next.winnerIds.length).toBeGreaterThanOrEqual(1);
    expect(next.round).toBe(1); // no new round started
  });

  it('ends the game when the card deck cannot refill the display (SA11)', () => {
    // Two slots taken, empty deck → the display can't be refilled → game ends.
    const base = feeding({}, { activePlayerIndex: 1, startPlayerIndex: 0 });
    const short = { ...base, cardDeck: [], cardDisplay: [base.cardDisplay[0]!, null, null, base.cardDisplay[3]!] };
    const next = feed(short, 'p2');
    expect(next.status).toBe('ended');
    expect(next.results).not.toBeNull();
  });
});
