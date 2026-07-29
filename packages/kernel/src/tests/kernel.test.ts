import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { KERNEL_CONTRACT_VERSION } from '../contract';
import { GameError } from '../errors';
import { record } from '../record';
import type { VersionedState } from '../record';
import { makeSeating } from '../seating';

describe('GameError', () => {
  it('carries a machine-readable code and the message, named GameError', () => {
    const error = new GameError('OUT_OF_SUPPLY', 'no white left');
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('OUT_OF_SUPPLY');
    expect(error.message).toBe('no white left');
    expect(error.name).toBe('GameError');
  });

  it('a subclass can pin its own code union and stays instanceof itself', () => {
    class ContainerError extends GameError<'NOT_YOUR_TURN'> {}
    const error = new ContainerError('NOT_YOUR_TURN', 'wait your turn');
    expect(error).toBeInstanceOf(ContainerError);
    expect(error).toBeInstanceOf(GameError);
    expect(error.code).toBe('NOT_YOUR_TURN');
  });
});

interface DemoState extends VersionedState {
  readonly count: number;
}

describe('record', () => {
  const base: DemoState = { count: 0, version: 3, log: [] };

  it('applies changes, bumps version, and appends a log entry (no payload)', () => {
    const next = record(base, 'BUMP', 'p1', { count: 1 });
    expect(next.count).toBe(1);
    expect(next.version).toBe(4);
    expect(next.log).toEqual([{ seq: 4, type: 'BUMP', playerId: 'p1' }]);
  });

  it('includes the payload in the entry when one is given', () => {
    const next = record(base, 'BUMP', 'p1', { count: 2 }, { by: 2 });
    expect(next.log).toEqual([{ seq: 4, type: 'BUMP', playerId: 'p1', payload: { by: 2 } }]);
  });

  it('defaults changes to {} — a pure log entry leaves the rest of the state untouched', () => {
    const next = record(base, 'NOOP', 'p2');
    expect(next.count).toBe(0);
    expect(next.version).toBe(4);
    expect(next.log).toEqual([{ seq: 4, type: 'NOOP', playerId: 'p2' }]);
  });

  it('does not mutate the input state', () => {
    record(base, 'BUMP', 'p1', { count: 9 });
    expect(base).toEqual({ count: 0, version: 3, log: [] });
  });
});

describe('makeSeating', () => {
  interface Player {
    readonly id: string;
    readonly score: number;
  }
  class NotFound extends Error {}
  const seating = makeSeating<Player>((id) => {
    throw new NotFound(id);
  });
  const state = {
    players: [
      { id: 'p1', score: 0 },
      { id: 'p2', score: 5 },
    ],
    activePlayerIndex: 1,
  };

  it('seatOf finds a seat by id', () => {
    expect(seating.seatOf(state, 'p2')).toBe(1);
  });

  it('seatOf throws the injected error for an unknown id', () => {
    expect(() => seating.seatOf(state, 'ghost')).toThrow(NotFound);
  });

  it('withPlayer replaces one seat immutably', () => {
    const roster = seating.withPlayer(state, 0, { id: 'p1', score: 9 });
    expect(roster).toEqual([
      { id: 'p1', score: 9 },
      { id: 'p2', score: 5 },
    ]);
    expect(state.players[0]).toEqual({ id: 'p1', score: 0 });
  });

  it('activePlayer reads the seat at activePlayerIndex', () => {
    expect(seating.activePlayer(state)).toEqual({ id: 'p2', score: 5 });
  });
});

describe('KERNEL_CONTRACT_VERSION', () => {
  // The number is a *promise*, not a detail: games declare it and the host's registry refuses a
  // mismatch (design doc §4). Pinning it here means bumping it can never be an accident — a breaking
  // change to the GameModule/GameClient contracts has to come with a deliberate edit to this test, and
  // (per the rule in `contract.ts`) a major version bump of the package.
  it('is 1 — the contract every hosted game declares', () => {
    expect(KERNEL_CONTRACT_VERSION).toBe(1);
  });

  // It must match the package's own major: "the kernel's major version IS the contract version" is the
  // whole rule, and a `1.x` package exporting contract 2 would silently break every installed game.
  it('matches the major version of the published package', () => {
    expect(Number(pkg.version.split('.')[0])).toBe(KERNEL_CONTRACT_VERSION);
  });
});
