import { describe, expect, it } from 'vitest';
import { getPlayer, reprice } from '../index';
import { expectError, makeGame, makePlayer, newGame, sc } from './helpers';

describe('reprice', () => {
  it('rearranges factory containers into new lots', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2), sc('red', 3)], factoryLimit: 4 });
    const next = reprice(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'factory', [
      sc('white', 6),
      sc('red', 1),
    ]);
    expect(getPlayer(next, 'p1').factoryStore).toEqual([sc('white', 6), sc('red', 1)]);
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'REPRICE', playerId: 'p1', payload: { district: 'factory' } });
  });

  it('rearranges harbor containers using harbor lot prices', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 2)], harborLimit: 3 });
    const next = reprice(makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]), 'p1', 'harbor', [
      sc('blue', 7),
    ]);
    expect(getPlayer(next, 'p1').harborStore).toEqual([sc('blue', 7)]);
  });

  it('rejects a lot price invalid for the district', () => {
    const p1 = makePlayer({ id: 'p1', harborStore: [sc('blue', 2)], harborLimit: 3 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    // $1 is a valid factory lot but not a valid harbor lot.
    expectError(() => reprice(state, 'p1', 'harbor', [sc('blue', 1)]), 'INVALID_LOT_PRICE');
  });

  it('rejects an arrangement that changes which containers are stored', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2)], factoryLimit: 4 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => reprice(state, 'p1', 'factory', [sc('red', 2)]), 'INVALID_SELECTION');
  });

  it('rejects an arrangement of a different size', () => {
    const p1 = makePlayer({ id: 'p1', factoryStore: [sc('white', 2)], factoryLimit: 4 });
    const state = makeGame([p1, makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => reprice(state, 'p1', 'factory', [sc('white', 2), sc('white', 3)]), 'INVALID_SELECTION');
  });

  it('throws PLAYER_NOT_FOUND for an unknown player', () => {
    expectError(() => reprice(newGame(), 'ghost', 'factory', []), 'PLAYER_NOT_FOUND');
  });
});
