/**
 * `@game-hub/bot` — AI players for Container. THE public API; consumers import only from here.
 *
 * The split from `@game-hub/engine` is deliberate: the **engine owns the rules** (what is legal),
 * this package owns the **opinions** (what is wise). Nothing here is authoritative — a bot only ever
 * produces an `Action` that the engine then validates like any human's move.
 *
 * A bot decides from a `GameView`, never a `GameState`, so it is structurally incapable of reading
 * an opponent's secret scoring card.
 */
export { decide } from './decide';
export { contextFor } from './context';
export { bidFor, chooseTiedWinner, runoffBidFor, wantsBuyout } from './bid';
export { playSelfPlay, defaultPolicy } from './selfPlay';
export { benchmark } from './bench';
export type { StrengthBenchOptions } from './bench';
export { BotError } from './errors';
export {
  AVERAGE_COLOR_VALUE,
  BID_SHADING,
  RESALE_PER_CONTAINER,
  RUNOFF_SHADING,
  expectedAuctionBid,
  expectedValueFor,
  gainFrom,
  islandScore,
  selfOf,
} from './valuation';

export type {
  BidCollector,
  BidFn,
  Candidate,
  Ctx,
  DecideFn,
  DecideOptions,
  RunoffBidFn,
  RunoffCollector,
  SeatPolicy,
} from './types';
export type { SelfPlayOptions, SelfPlayResult } from './selfPlay';
