import { expect } from 'vitest';
import { GameError } from '../core';
import type { CantStopState } from '../core';
import { createGame } from '../createGame';

/** A fresh game with the given seat names (two by default). */
export function newGame(names: string[] = ['Ann', 'Bob']): CantStopState {
  return createGame({ id: 'g1', players: names.map((name) => ({ name })) });
}

/** A game with fields overridden — the quick way to build a mid-turn position. */
export function makeState(overrides: Partial<CantStopState> = {}, names?: string[]): CantStopState {
  return { ...newGame(names), ...overrides };
}

/** Assert that `fn` throws a GameError with the given code. */
export function expectError(fn: () => unknown, code: string): void {
  expect(fn).toThrow(GameError);
  try {
    fn();
  } catch (error) {
    expect((error as GameError).code).toBe(code);
  }
}
