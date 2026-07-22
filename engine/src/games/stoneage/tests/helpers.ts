import { expect } from 'vitest';
import { GameError } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import { createGame } from '../createGame';

/** A fresh game with the given seat names (two by default). */
export function newGame(names: string[] = ['Ann', 'Bob']): StoneAgeState {
  return createGame({ id: 'g1', players: names.map((name) => ({ name })) });
}

/**
 * A game with fields overridden. The cast bridges the end-state discriminated union: spreading
 * `Partial<StoneAgeState>` over the active base can't be proven to land on one arm, but a fixture
 * builder's whole job is to fabricate an arbitrary position (e.g. `{ status: 'ended', ... }`).
 */
export function makeState(overrides: Partial<StoneAgeState> = {}, names?: string[]): StoneAgeState {
  return { ...newGame(names), ...overrides } as StoneAgeState;
}

/** A game with the given placements merged into the empty board (e.g. `{ forest: { p1: 3 } }`). */
export function withPlacements(
  placed: Partial<Record<PlaceId, Record<string, number>>>,
  overrides: Partial<StoneAgeState> = {},
  names?: string[],
): StoneAgeState {
  const base = newGame(names);
  const placements = { ...base.placements };
  for (const [place, byPlayer] of Object.entries(placed)) {
    placements[place as PlaceId] = { ...byPlayer };
  }
  return { ...base, placements, ...overrides } as StoneAgeState;
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
