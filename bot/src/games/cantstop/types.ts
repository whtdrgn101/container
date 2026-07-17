/**
 * Options for a Can't Stop decision.
 *
 * `rollDice` is the injection point for randomness the bot must not invent — exactly like Container's
 * `collectBids`. When the bot decides to roll, it needs four dice, but a pure bot can't produce them;
 * the caller supplies them (self-play from a seeded rng, the backend runner from `ctx.rng`). `decide`
 * throws a `BotError` if it wants to roll and none was given.
 */
export interface DecideOptions {
  readonly rollDice?: () => readonly [number, number, number, number];
}

/** A scored pairing option — the multiset of columns a SELECT would advance, plus its heuristic value. */
export interface PairingCandidate {
  readonly columns: readonly number[];
  readonly score: number;
}
