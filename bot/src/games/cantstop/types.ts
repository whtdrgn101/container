import type { Action, CantStopView } from '@game-hub/engine/cantstop';
import type { CantStopDifficulty } from './policy';

/**
 * Options for a Can't Stop decision.
 *
 * `rollDice` is the injection point for randomness the bot must not invent — exactly like Container's
 * `collectBids`. When the bot decides to roll, it needs four dice, but a pure bot can't produce them;
 * the caller supplies them (self-play from a seeded rng, the backend runner from `ctx.rng`). `decide`
 * throws a `BotError` if it wants to roll and none was given.
 *
 * `difficulty` (CS4) picks which parameter set the risk model runs under. Omitted ⇒ `'normal'`, the
 * frozen baseline — so every pre-CS4 caller behaves exactly as before.
 */
export interface DecideOptions {
  readonly rollDice?: () => readonly [number, number, number, number];
  readonly difficulty?: CantStopDifficulty;
}

/** A scored pairing option — the multiset of columns a SELECT would advance, plus its heuristic value. */
export interface PairingCandidate {
  readonly columns: readonly number[];
  readonly score: number;
}

/**
 * The shape of a decision policy — `decide`'s signature. Self-play accepts one per seat so different
 * policies can play each other (the strength benchmark pits a candidate against a frozen baseline).
 */
export type DecideFn = (view: CantStopView, playerId: string, options?: DecideOptions) => Action;
