import type { Action, StoneAgeView } from '@game-hub/engine/stoneage';

/**
 * Options for a Stone Age decision.
 *
 * `rollDice` is the injection point for randomness the bot must not invent — like Container's
 * `collectBids` and Can't Stop's `rollDice`. Gathering is a two-step move (roll → take); when the bot
 * chooses to gather a place it needs one die per worker there, but a pure bot can't produce them, so the
 * caller supplies them (self-play from a seeded rng, the backend runner from `ctx.rng`). `decide` throws
 * a `BotError` if it wants to roll and none was given.
 */
export interface DecideOptions {
  readonly rollDice?: (count: number) => number[];
}

/**
 * The shape of a decision policy — `decide`'s signature. Self-play accepts one per seat so different
 * policies can play each other (the strength benchmark pits the live policy against a frozen legacy copy).
 */
export type DecideFn = (view: StoneAgeView, playerId: string, options?: DecideOptions) => Action;
