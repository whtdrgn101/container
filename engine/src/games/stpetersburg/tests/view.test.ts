import { describe, expect, it } from 'vitest';
import type { StPetersburgPlayer } from '../core';
import { viewFor } from '../view';
import { card, makeState, newGame } from './helpers';

/** A game where p2 holds a secret hand card and a distinct ruble count, for redaction assertions. */
function withSecrets() {
  const base = newGame(['Ann', 'Bob', 'Cy']);
  const secretCard = card({ id: 'secret-market-1', key: 'market', kind: 'building', name: 'Market', cost: 5, income: 0, points: 1 });
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

  it('reveals everything once the game has ended (final scoring is public)', () => {
    const { state } = withSecrets();
    const ended = makeState({ ...state, status: 'ended', results: [], winnerIds: ['p1'] }, ['Ann', 'Bob', 'Cy']);
    const view = viewFor(ended, null); // even a spectator sees the final position
    expect(view.players[1]!.rubles).toBe(777);
    expect(view.players[1]!.hand).toHaveLength(1);
  });
});
