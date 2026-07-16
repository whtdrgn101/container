import { SCORING_CARDS, applyAction, legalActions, viewFor } from '@container/engine';
import type { GameState } from '@container/engine';
import { describe, expect, it, vi } from 'vitest';
import { decide } from '../decide';
import { BotError } from '../errors';
import { makeGame, makePlayer, newGame, sc, viewOf } from './helpers';

const CARD = SCORING_CARDS[0]!;

/** Every action `decide` returns must survive the engine — that is the contract that matters. */
const expectPlayable = (state: GameState, playerId: string, options = {}) => {
  const action = decide(viewOf(state, playerId), playerId, options);
  expect(() => applyAction(state, playerId, action)).not.toThrow();
  return action;
};

describe('decide — contract', () => {
  it('returns a playable action from an opening position', () => {
    const state = newGame(3);
    expectPlayable(state, 'p1');
  });

  it('only ever returns an action the engine listed as legal', () => {
    const state = newGame(4);
    const action = decide(viewOf(state, 'p1'), 'p1');
    const legalTypes = legalActions(state).map((candidate) => candidate.type);
    expect(legalTypes).toContain(action.type);
  });

  it('is deterministic — the same view decides the same way', () => {
    const state = newGame(3);
    expect(decide(viewOf(state, 'p1'), 'p1')).toEqual(decide(viewOf(state, 'p1'), 'p1'));
  });

  it('refuses a view that is not the bot own', () => {
    const state = newGame(3);
    expect(() => decide(viewFor(state, 'p2'), 'p1')).toThrow(BotError);
  });

  it('refuses to act out of turn', () => {
    const state = newGame(3);
    expect(() => decide(viewOf(state, 'p2'), 'p2')).toThrow(/not bot seat "p2"'s turn/);
  });

  it('refuses to act in a finished game', () => {
    const state = { ...newGame(3), status: 'ended' as const };
    expect(() => decide(viewOf(state, 'p1'), 'p1')).toThrow(/has ended/);
  });

  it('ends the turn when nothing is worth doing', () => {
    // Broke, no factories, ship stuck in the ocean: every policy should decline.
    const state = makeGame([
      makePlayer({ id: 'p1', money: 0, factories: [], factoryStore: [], loans: 2 }),
      makePlayer({ id: 'p2' }),
      makePlayer({ id: 'p3' }),
    ]);
    expect(decide(viewOf(state, 'p1'), 'p1')).toEqual({ type: 'END_TURN' });
  });
});

describe('decide — delivery', () => {
  const atIsland = () =>
    makeGame([
      makePlayer({
        id: 'p1',
        scoringCard: CARD,
        ship: { location: { kind: 'island' }, cargo: ['white', 'red'] },
      }),
      makePlayer({ id: 'p2', money: 20 }),
      makePlayer({ id: 'p3', money: 20 }),
    ]);

  it('refuses to deliver without collected bids', () => {
    // The blocker that shapes roadmap A1: sealed bids can only come from the other players, so the
    // bot must not guess them. Failing loudly here is the point.
    expect(() => decide(viewOf(atIsland(), 'p1'), 'p1')).toThrow(/no collectBids was supplied/);
  });

  it('resolves the auction with the collected bids', () => {
    const state = atIsland();
    const collectBids = vi.fn(() => ({ p2: 4, p3: 1 }));
    const action = expectPlayable(state, 'p1', { collectBids });

    expect(collectBids).toHaveBeenCalledWith(['white', 'red']);
    expect(action).toMatchObject({ type: 'DELIVER', bids: { p2: 4, p3: 1 } });

    // p2 wins the cargo; the deliverer collects the bid plus a matching subsidy.
    const next = applyAction(state, 'p1', action);
    expect(next.players[1]!.scoringArea).toEqual(['white', 'red']);
    expect(next.players[0]!.money).toBe(20 + 4 * 2);
  });

  it('buys out when the cargo is worth far more than the bid', () => {
    // white+red is worth $10 to sc1 and the table is bidding $1, so keeping it ($10 − $1 = $9)
    // beats selling it (2 × $1 = $2).
    const state = atIsland();
    const action = decide(viewOf(state, 'p1'), 'p1', { collectBids: () => ({ p2: 1, p3: 0 }) });
    expect(action).toMatchObject({ type: 'DELIVER', buyout: true });

    const next = applyAction(state, 'p1', action);
    expect(next.players[0]!.scoringArea).toEqual(['white', 'red']);
  });

  it('sells rather than buying out when the bidding is strong', () => {
    const state = atIsland();
    const action = decide(viewOf(state, 'p1'), 'p1', { collectBids: () => ({ p2: 9, p3: 0 }) });
    expect(action).not.toHaveProperty('buyout');
    expect(() => applyAction(state, 'p1', action)).not.toThrow();
  });

  it('treats a missing bid as a $0 bluff', () => {
    const state = atIsland();
    const action = expectPlayable(state, 'p1', { collectBids: () => ({}) });
    expect(action).toMatchObject({ type: 'DELIVER' });
  });
});
