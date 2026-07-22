import { expect } from 'vitest';
import { GameError } from '../core';
import type { Card, StPetersburgState } from '../core';
import { createGame } from '../createGame';

/** A fresh, deterministic game (no rng → fixed deck/marker order) with the given seat names. */
export function newGame(names: string[] = ['Ann', 'Bob']): StPetersburgState {
  return createGame({ id: 'g1', players: names.map((name) => ({ name })) });
}

/**
 * A game with fields overridden — the quick way to build an arbitrary position. The cast bridges the
 * end-state discriminated union (spreading `Partial` over the active base can't be proven to land on one
 * arm), the same shape the other games' helpers use.
 */
export function makeState(overrides: Partial<StPetersburgState> = {}, names?: string[]): StPetersburgState {
  return { ...newGame(names), ...overrides } as StPetersburgState;
}

/** A throwaway card instance for hand/redaction fixtures. */
export function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'test-card-1',
    key: 'lumberjack',
    kind: 'worker',
    name: 'Lumberjack',
    cost: 3,
    income: 3,
    points: 0,
    ...overrides,
  };
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
