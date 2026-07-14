import { describe, expect, it } from 'vitest';
import { applyAction, getPlayer, sail } from '../index';
import { expectError, makeGame, makePlayer, newGame } from './helpers';

const atHarbor = (playerId: string) =>
  makePlayer({ id: 'p1', ship: { location: { kind: 'harbor', playerId }, cargo: [] } });

describe('sail', () => {
  it('sails from the ocean to an opponent harbor', () => {
    const next = sail(newGame(3), 'p1', { kind: 'harbor', playerId: 'p2' });
    expect(getPlayer(next, 'p1').ship.location).toEqual({ kind: 'harbor', playerId: 'p2' });
    expect(next.log.at(-1)).toEqual({ seq: 1, type: 'SAIL', playerId: 'p1', payload: { to: { kind: 'harbor', playerId: 'p2' } } });
  });

  it('sails from the ocean to Container Island', () => {
    expect(getPlayer(sail(newGame(3), 'p1', { kind: 'island' }), 'p1').ship.location).toEqual({ kind: 'island' });
  });

  it('sails from the ocean to the Off-Shore Bank', () => {
    expect(getPlayer(sail(newGame(3), 'p1', { kind: 'bank' }), 'p1').ship.location).toEqual({ kind: 'bank' });
  });

  it('sails from a harbor back to the ocean', () => {
    const state = makeGame([atHarbor('p2'), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expect(getPlayer(sail(state, 'p1', { kind: 'ocean' }), 'p1').ship.location).toEqual({ kind: 'ocean' });
  });

  it('does not mutate the input state', () => {
    const state = newGame(3);
    sail(state, 'p1', { kind: 'island' });
    expect(getPlayer(state, 'p1').ship.location).toEqual({ kind: 'ocean' });
  });

  it('rejects entering your own harbor', () => {
    expectError(() => sail(newGame(3), 'p1', { kind: 'harbor', playerId: 'p1' }), 'CANNOT_ENTER_OWN_HARBOR');
  });

  it('rejects sailing ocean → ocean', () => {
    expectError(() => sail(newGame(3), 'p1', { kind: 'ocean' }), 'INVALID_DESTINATION');
  });

  it('rejects sailing directly between two destinations', () => {
    const state = makeGame([atHarbor('p2'), makePlayer({ id: 'p2' }), makePlayer({ id: 'p3' })]);
    expectError(() => sail(state, 'p1', { kind: 'island' }), 'INVALID_DESTINATION');
  });

  it('rejects sailing to an unknown player harbor', () => {
    expectError(() => sail(newGame(3), 'p1', { kind: 'harbor', playerId: 'ghost' }), 'PLAYER_NOT_FOUND');
  });

  it('rejects an unknown actor', () => {
    expectError(() => sail(newGame(3), 'ghost', { kind: 'island' }), 'PLAYER_NOT_FOUND');
  });

  it('is dispatched by applyAction and spends one action', () => {
    const next = applyAction(newGame(3), 'p1', { type: 'SAIL', to: { kind: 'bank' } });
    expect(getPlayer(next, 'p1').ship.location).toEqual({ kind: 'bank' });
    expect(next.actionsRemaining).toBe(1);
  });
});
