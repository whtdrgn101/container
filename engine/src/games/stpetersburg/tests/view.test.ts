import { describe, expect, it } from 'vitest';
import { addToHand, playFromHand } from '../actions';
import type { StPetersburgPlayer } from '../core';
import { viewFor } from '../view';
import { card, makeState, newGame } from './helpers';

/** A game where p2 holds a secret hand card and a distinct ruble count, for redaction assertions. */
function withSecrets() {
  const base = newGame(['Ann', 'Bob', 'Cy']);
  const secretCard = card({
    id: 'secret-market-1',
    key: 'market',
    kind: 'building',
    name: 'Market',
    cost: 5,
    income: 0,
    points: 1,
  });
  const players: StPetersburgPlayer[] = base.players.map((p, i) =>
    i === 1 ? { ...p, rubles: 777, hand: [secretCard] } : p,
  );
  return { state: makeState({ players }, ['Ann', 'Bob', 'Cy']), secretCard };
}

describe('viewFor redaction', () => {
  it('shows the viewer their own rubles and hand, opponents only a count', () => {
    const { state, secretCard } = withSecrets();
    const view = viewFor(state, 'p1');

    const me = view.players[0]!;
    expect(me.rubles).toBe(25);
    expect(me.hand).toEqual([]);
    expect(me.handCount).toBe(0);

    const opp = view.players[1]!;
    expect(opp.rubles).toBeNull();
    expect(opp.points).toBe(0); // the public score track is never redacted
    expect(opp.hand).toBeNull();
    expect(opp.handCount).toBe(1); // count is public
    expect(secretCard.id).toBe('secret-market-1'); // (the redacted card exists in the real state)
    expect(view.viewerId).toBe('p1');
  });

  it('never puts an opponent’s rubles or hand cards on the wire (serialized shape)', () => {
    const { state } = withSecrets();
    const wire = JSON.stringify(viewFor(state, 'p1'));
    expect(wire).not.toContain('777'); // p2's ruble count
    expect(wire).not.toContain('secret-market-1'); // p2's hidden card id
  });

  it('carries stack counts, never the draw-stack contents', () => {
    const view = viewFor(newGame(), 'p1');
    expect(view.board.stacks).toEqual({
      worker: 31 - 4, // 2-player seed is 4 workers
      building: 28,
      aristocrat: 27,
      trading: 30,
    });
    // A card id from a face-down stack must not be on the wire.
    const wire = JSON.stringify(view);
    const stackCardId = newGame().board.stacks.building[0]!.id;
    expect(wire).not.toContain(stackCardId);
  });

  it('treats a seat list as ownership and null/[] as a spectator', () => {
    const { state } = withSecrets();
    const twoSeats = viewFor(state, ['p1', 'p2']);
    expect(twoSeats.players[0]!.rubles).toBe(25);
    expect(twoSeats.players[1]!.rubles).toBe(777); // both owned → both revealed

    const spectator = viewFor(state, null);
    expect(spectator.players.every((p) => p.rubles === null && p.hand === null)).toBe(true);

    const empty = viewFor(state, []);
    expect(empty.players.every((p) => p.rubles === null)).toBe(true);
  });

  it('keeps a NON-EMPTY hand redacted across an add → play round-trip (owner: contents; opponent: count only)', () => {
    // Drive the real SP3 mechanics: p1 adds a building into hand, then plays it. At every step an opponent
    // sees only the hand COUNT, never its contents; the owner sees the cards. (The §B1-style wire test for
    // the hidden hand — now exercised with the hand actually non-empty, not just the SP0 zero-length case.)
    const base = newGame(['Ann', 'Bob']);
    const mkt = card({ id: 'market-hidden-1', key: 'market', kind: 'building', name: 'Market', cost: 5, points: 1 });
    const start = makeState({ ...base, board: { ...base.board, upper: [mkt] } });

    const added = addToHand(start, 'p1', 'upper', 0);
    // Owner: the card is visible in hand. Opponent: count only, contents null, and the id isn't on the wire.
    expect(viewFor(added, 'p1').players[0]!.hand).toHaveLength(1);
    expect(viewFor(added, 'p1').players[0]!.handCount).toBe(1);
    const oppAdded = viewFor(added, 'p2');
    expect(oppAdded.players[0]!.hand).toBeNull();
    expect(oppAdded.players[0]!.handCount).toBe(1);
    expect(JSON.stringify(oppAdded)).not.toContain('market-hidden-1');

    // Play it from hand — the hand empties, the card becomes public in the play area, and redaction holds.
    const played = playFromHand(added, 'p1', 0);
    expect(viewFor(played, 'p1').players[0]!.hand).toEqual([]); // owner sees an empty hand
    expect(viewFor(played, 'p2').players[0]!.handCount).toBe(0); // opponent sees the count drop to 0
    expect(played.players[0]!.playArea.building.map((c) => c.id)).toEqual(['market-hidden-1']); // now public
    expect(viewFor(played, 'p2').players[0]!.rubles).toBeNull(); // the ruble cost stays the owner's secret
  });

  it('reveals everything once the game has ended (final scoring is public)', () => {
    const { state } = withSecrets();
    const ended = makeState({ ...state, status: 'ended', results: [], winnerIds: ['p1'] }, ['Ann', 'Bob', 'Cy']);
    const view = viewFor(ended, null); // even a spectator sees the final position
    expect(view.players[1]!.rubles).toBe(777);
    expect(view.players[1]!.hand).toHaveLength(1);
  });
});
