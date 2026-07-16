/**
 * `@container/bot` — AI players for Container. THE public API; consumers import only from here.
 *
 * The split from `@container/engine` is deliberate: the **engine owns the rules** (what is legal),
 * this package owns the **opinions** (what is wise). Nothing here is authoritative — a bot only ever
 * produces an `Action` that the engine then validates like any human's move.
 *
 * A bot decides from a `GameView`, never a `GameState`, so it is structurally incapable of reading
 * an opponent's secret scoring card.
 */
export { decide } from './decide';
export { bidFor, chooseTiedWinner, runoffBidFor, wantsBuyout } from './bid';
export { playSelfPlay } from './selfPlay';
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

export type { BidCollector, Candidate, Ctx, DecideOptions, RunoffCollector } from './types';
export type { SelfPlayOptions, SelfPlayResult } from './selfPlay';
