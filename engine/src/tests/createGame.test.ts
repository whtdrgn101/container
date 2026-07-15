import { describe, expect, it } from 'vitest';
import { ACTIONS_PER_TURN, createGame, STARTING_MONEY } from '../index';
import { expectError, newGame, sc } from './helpers';

describe('createGame', () => {
  it('creates a valid 3-player game with priced starting container and building supply', () => {
    const state = newGame(3);

    expect(state.players).toHaveLength(3);
    expect(state.activePlayerIndex).toBe(0);
    expect(state.actionsRemaining).toBe(ACTIONS_PER_TURN);
    expect(state.turn).toBe(1);

    const p1 = state.players[0];
    expect(p1).toMatchObject({ id: 'p1', money: STARTING_MONEY, factoryLimit: 2, warehouses: 1, harborLimit: 1 });
    expect(p1?.factories).toEqual([{ id: 'p1-f1', color: 'white' }]);
    expect(p1?.factoryStore).toEqual([sc('white', 2)]); // starting container in the $2 lot
    expect(p1?.harborStore).toEqual([]);
    expect(p1?.ship).toEqual({ location: { kind: 'ocean' }, cargo: [] }); // starts in the ocean
    expect(p1?.scoringArea).toEqual([]);
    // Each player is dealt a secret scoring card (default deal is by seat).
    expect(p1?.scoringCard.id).toBe('sc1');
    expect(state.players[1]?.scoringCard.id).toBe('sc2');

    expect(state.supply.factories).toEqual({ white: 1, red: 1, green: 1, blue: 2, yellow: 2 });
    expect(state.supply.warehouses).toBe(12 - 3);
    // 3p: 11 containers/color, minus the starting container for white/red/green.
    expect(state.supply.containers).toEqual({ white: 10, red: 10, green: 10, blue: 11, yellow: 11 });
  });

  it('respects an explicit starting color', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', startingColor: 'yellow' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.factoryStore).toEqual([sc('yellow', 2)]);
  });

  it('assigns distinct colors and 5-player supply', () => {
    const state = newGame(5);
    expect(state.players.map((p) => p.factories[0]?.color)).toEqual(['white', 'red', 'green', 'blue', 'yellow']);
    expect(state.supply.factories).toEqual({ white: 3, red: 3, green: 3, blue: 3, yellow: 3 });
    expect(state.supply.warehouses).toBe(20 - 5);
    expect(state.supply.containers).toEqual({ white: 16, red: 16, green: 16, blue: 16, yellow: 16 });
  });

  it('deals an explicitly chosen scoring card', () => {
    const state = createGame({
      id: 'g1',
      players: [{ name: 'Ann', scoringCardId: 'sc4' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    expect(state.players[0]?.scoringCard.id).toBe('sc4');
  });

  it('rejects an unknown scoring card id', () => {
    expectError(
      () => createGame({ id: 'g1', players: [{ name: 'Ann', scoringCardId: 'nope' }, { name: 'Bob' }, { name: 'Cid' }] }),
      'INVALID_SELECTION',
    );
  });

  it('rejects fewer than 3 players', () => {
    expectError(() => createGame({ id: 'g1', players: [{ name: 'A' }, { name: 'B' }] }), 'INVALID_PLAYER_COUNT');
  });

  it('rejects more than 5 players', () => {
    const players = Array.from({ length: 6 }, (_, i) => ({ name: `P${i}` }));
    expect(() => createGame({ id: 'g1', players })).toThrowError(/3–5 players/);
  });
});
