import { describe, expect, it } from 'vitest';
import { SCORING_CARDS, viewFor } from '../index';
import { makeGame, makePlayer } from './helpers';

describe('viewFor', () => {
  const p1 = makePlayer({ id: 'p1', scoringCard: SCORING_CARDS[0]! });
  const p2 = makePlayer({ id: 'p2', scoringCard: SCORING_CARDS[1]! });
  const game = makeGame([p1, p2]);

  it('reveals the viewer’s own scoring card and hides everyone else’s', () => {
    const view = viewFor(game, 'p1');
    expect(view.viewerId).toBe('p1');
    expect(view.players[0]!.scoringCard).toEqual(SCORING_CARDS[0]);
    expect(view.players[1]!.scoringCard).toBeNull();
  });

  it('hides every card from a spectator (no seat) while the game is active', () => {
    const view = viewFor(game, null);
    expect(view.viewerId).toBeNull();
    expect(view.players.every((p) => p.scoringCard === null)).toBe(true);
  });

  it('reveals exactly the cards of a viewer holding several seats, and no others', () => {
    const p3 = makePlayer({ id: 'p3', scoringCard: SCORING_CARDS[2]! });
    const threeSeat = makeGame([p1, p2, p3]);
    const view = viewFor(threeSeat, ['p1', 'p3']);
    expect(view.players[0]!.scoringCard).toEqual(SCORING_CARDS[0]); // held
    expect(view.players[1]!.scoringCard).toBeNull(); // not held
    expect(view.players[2]!.scoringCard).toEqual(SCORING_CARDS[2]); // held
  });

  it('treats an empty seat list as a spectator (no cards)', () => {
    const view = viewFor(game, []);
    expect(view.players.every((p) => p.scoringCard === null)).toBe(true);
  });

  it('reveals all cards once the game has ended, regardless of viewer', () => {
    const ended = makeGame([p1, p2], { status: 'ended' });
    const view = viewFor(ended, null);
    expect(view.players[0]!.scoringCard).toEqual(SCORING_CARDS[0]);
    expect(view.players[1]!.scoringCard).toEqual(SCORING_CARDS[1]);
  });

  it('does not mutate the source state', () => {
    const snapshot = JSON.parse(JSON.stringify(game));
    viewFor(game, 'p1');
    expect(game).toEqual(snapshot);
  });

  it('preserves all non-redacted fields', () => {
    const view = viewFor(game, 'p1');
    expect(view.id).toBe(game.id);
    expect(view.version).toBe(game.version);
    expect(view.players[0]!.money).toBe(p1.money);
  });
});
