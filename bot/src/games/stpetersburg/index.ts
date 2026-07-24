/**
 * `@game-hub/bot/stpetersburg` — the AI for Saint Petersburg. THE public API; consumers import only here.
 *
 * Like the other bots: **engine = rules, bot = opinions**, and nothing here is authoritative — it only
 * ever produces an `Action` the engine then validates. The novelty (roadmap SP9): this is the first bot on
 * the platform deciding from a **genuinely redacted** view — opponents' rubles and hands, and the draw
 * stacks, are hidden — so it reads only its own seat's knowledge, which the view type makes structural. It
 * needs no injected randomness (Saint Petersburg has no dice), so `decide` takes no options.
 */
export { decide } from './decide';
export { playSelfPlay } from './selfPlay';
export { benchmark } from './bench';
export type { StrengthBenchOptions } from './bench';
export {
  acquisitionValue,
  aristocratEndDelta,
  estimateRoundsLeft,
  evaluate,
  makeCtx,
  pickAction,
  WEIGHTS,
} from './policy';
export type { Ctx } from './policy';
export { BotError } from '../../kernel';

export type { DecideFn } from './types';
export type { SelfPlayOptions, SelfPlayResult } from './selfPlay';
