/**
 * `@game-hub/bot/stoneage` — the AI for Stone Age. THE public API; consumers import only from here.
 *
 * Like the other bots: **engine = rules, bot = opinions**, and nothing here is authoritative — it only
 * ever produces an `Action` the engine then validates. Stone Age hides almost nothing, so the bot is a
 * pure heuristic over public state; its one dependency on the caller is the gather dice it cannot invent
 * (`DecideOptions.rollDice`), the same injection point Can't Stop has.
 */
export { decide } from './decide';
export { playSelfPlay } from './selfPlay';
export { benchmark } from './bench';
export type { StrengthBenchOptions } from './bench';
export {
  buildingPaymentFor,
  cardPaymentFor,
  chooseTools,
  foodDeficit,
  heldScoring,
  pickPlacement,
  placementValue,
  remainingRounds,
  residualAfterCommitments,
  WEIGHTS,
} from './policy';
export { BotError } from '../../kernel';

export type { DecideFn, DecideOptions } from './types';
export type { SelfPlayOptions, SelfPlayResult } from './selfPlay';
