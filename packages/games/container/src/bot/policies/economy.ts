import type { Action } from '../../engine';
import type { Candidate, Ctx } from '../types';
import { producePlacements, repriceArrangement } from './pricing';

/** Cash at or below this is an emergency — a loan is cheaper than being unable to act at all. */
const CASH_FLOOR = 3;
/** Cash at or above this can spare $10 to clear a loan before it costs $11 at scoring. */
const COMFORTABLE_CASH = 20;

/** Producing is the bot's income engine — stock in the factory is what opponents come to buy. */
export function rankProduce(ctx: Ctx): Candidate | null {
  const placements = producePlacements(ctx);
  if (!placements) {
    return null;
  }
  return { action: { type: 'PRODUCE', placements }, score: 50 + 4 * placements.length };
}

/**
 * A second and third factory widen what the bot can produce and are the best money it spends. A
 * fourth costs $12 and rarely repays that before the game ends, so it sinks below Produce.
 */
export function rankBuildFactory(ctx: Ctx, action: Extract<Action, { type: 'BUILD_FACTORY' }>): Candidate {
  const owned = ctx.me.factories.length;
  const base = owned <= 1 ? 62 : owned === 2 ? 34 : 8;
  // Prefer a color the supply is deep in: a nearly-exhausted color is a factory that soon idles.
  const depth = Math.min(ctx.view.supply.containers[action.color], 6);
  return { action, score: base + depth };
}

/** Warehouses only matter when the harbor is actually full — otherwise it's cash for nothing. */
export function rankBuildWarehouse(ctx: Ctx): Candidate {
  const full = ctx.me.harborStore.length >= ctx.me.harborLimit;
  return { action: { type: 'BUILD_WAREHOUSE' }, score: full ? 44 : 10 };
}

/** Cheap to do, but it costs a whole action, so it only wins a turn with nothing better going on. */
export function rankReprice(ctx: Ctx, action: Extract<Action, { type: 'REPRICE' }>): Candidate | null {
  const arrangement = repriceArrangement(ctx, action.district);
  if (!arrangement) {
    return null;
  }
  return { action: { ...action, arrangement }, score: 7 };
}

/** $10 now costs $1/turn interest and $11 at scoring — worth it only when otherwise stuck. */
export function rankRequestLoan(ctx: Ctx): Candidate | null {
  if (ctx.me.money > CASH_FLOOR) {
    return null;
  }
  return { action: { type: 'REQUEST_LOAN' }, score: 40 };
}

/** Clearing a loan while flush turns an $11 endgame penalty into a $10 payment. */
export function rankRepayLoan(ctx: Ctx): Candidate | null {
  if (ctx.me.money < COMFORTABLE_CASH) {
    return null;
  }
  return { action: { type: 'REPAY_LOAN' }, score: 30 };
}
