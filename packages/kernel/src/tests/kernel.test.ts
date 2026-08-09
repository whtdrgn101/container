import { describe, expect, it } from 'vitest';
import pkg from '../../package.json';
import { KERNEL_CONTRACT_VERSION } from '../contract';
import { GameError } from '../errors';
import { record } from '../record';
import type { VersionedState } from '../record';
import type { MoveRecord } from '../moveRecord';
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

/**
 * The typed move log (kernel 1.4.0).
 *
 * ⚠️ **Most of what this feature does is refuse to compile**, which no runtime assertion can observe —
 * so the negative cases are pinned with `@ts-expect-error`, which fails the build if the error it names
 * ever *stops* happening. That is the actual regression guard here; the runtime expectations below only
 * confirm the values still flow through unchanged.
 */
describe('record — a typed log (MoveRecord<T>)', () => {
  type TypedLog = 'BID' | 'PLAY';
  interface TypedState extends VersionedState<TypedLog> {
    readonly count: number;
  }
  const typed: TypedState = { count: 0, version: 0, log: [] };
  // A state whose log was never given a union — i.e. every game written before 1.4.0.
  const untyped: DemoState = { count: 0, version: 0, log: [] };

  it('accepts a type the state declares, and carries it through unchanged', () => {
    const next = record(typed, 'BID', 'p1', { count: 1 });
    expect(next.log).toEqual([{ seq: 1, type: 'BID', playerId: 'p1' }]);
    // Reading one back is narrowed too: `entry.type` is the union, so this switch is exhaustive.
    const entry = next.log[0]!;
    const described: string = entry.type === 'BID' ? 'a bid' : 'a play';
    expect(described).toBe('a bid');
  });

  it('⚠️ refuses a type the state does not declare — the typo this whole change exists for', () => {
    // @ts-expect-error 'BDI' is not one of TypedState's record types.
    record(typed, 'BDI', 'p1');
    // …and a plausible-but-absent sibling is refused just the same.
    // @ts-expect-error 'TRICK' is not one of TypedState's record types.
    record(typed, 'TRICK', 'p1');
  });

  it('leaves an untyped log exactly as it was — this addition is not a migration', () => {
    // `DemoState`'s log is a bare `MoveRecord[]`, so `RecordTypeOf` is `string` and anything goes. Every
    // game that predates 1.4.0 is this case, which is why none of them had to change.
    const next = record(untyped, 'ANYTHING-AT-ALL', 'p1');
    expect(next.log[0]?.type).toBe('ANYTHING-AT-ALL');
  });

  it('a typed state still satisfies the bare VersionedState a host consumes', () => {
    // The host's `movesOf(state): readonly MoveRecord[]` must keep accepting a game that typed its log —
    // readonly-array covariance is what makes that work, and this is the assertion that pins it.
    const asPlain: VersionedState = typed;
    const asPlainLog: readonly MoveRecord[] = typed.log;
    expect(asPlain.version).toBe(0);
    expect(asPlainLog).toEqual([]);
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
