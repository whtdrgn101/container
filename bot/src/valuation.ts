import { COLORS, SCORING_CARDS, finalScoring } from '@container/engine/container';
import type { Color, GameView, PlayerState, PlayerView } from '@container/engine/container';
import { BotError } from './errors';
import type { Ctx } from './types';

/**
 * Resolve the bot's own seat from its view, proving the view really is *its* view.
 *
 * A bot is always handed `viewFor(state, botId)` so it cannot read opponents' secret cards. The flip
 * side is that its own card must be present — if it isn't, the caller passed a spectator view or
 * another seat's view, and every valuation below would silently be garbage. Fail loudly instead.
 */
export function selfOf(view: GameView, playerId: string): PlayerState {
  const me = view.players.find((player) => player.id === playerId);
  if (!me) {
    throw new BotError(`Bot seat "${playerId}" is not in game "${view.id}"`);
  }
  if (me.scoringCard === null) {
    throw new BotError(
      `Bot seat "${playerId}" cannot see its own scoring card — pass viewFor(state, "${playerId}"), not another seat's view`,
    );
  }
  return { ...me, scoringCard: me.scoringCard };
}

/**
 * What this player's Container Island area would score, by their own card.
 *
 * Delegates to the engine's real `finalScoring` rather than re-deriving it. That matters: the island
 * score is not a simple sum — you discard your most-common color, and the two-value color swings
 * $5→$10 only on a full rainbow. A bot valuing containers with its own simplified formula would
 * misprice exactly the positions those rules make interesting, and would drift the moment the rules
 * are corrected. Reusing the engine keeps bot and rules in lockstep by construction.
 */
export function islandScore(me: PlayerState, area: readonly Color[]): number {
  return finalScoring([{ ...me, scoringArea: area }])[0]!.islandScore;
}

/** The marginal island score this player gains by adding `extra` to their scoring area. */
export function gainFrom(me: PlayerState, extra: readonly Color[]): number {
  const before = islandScore(me, me.scoringArea);
  const after = islandScore(me, [...me.scoringArea, ...extra]);
  return after - before;
}

/**
 * Mean value of one container across the whole scoring deck ($5.40 — cards are 10/5/6/4/2).
 * Derived from `SCORING_CARDS` rather than hardcoded, so retuning the deck retunes the bot.
 * Used to estimate what an opponent (whose card is hidden) will pay for cargo.
 */
export const AVERAGE_COLOR_VALUE =
  SCORING_CARDS.reduce(
    (sum, card) => sum + COLORS.reduce((cardSum, color) => cardSum + card.values[color], 0),
    0,
  ) /
  (SCORING_CARDS.length * COLORS.length);

/**
 * Fraction of true value a rational opponent bids. Bidding your full valuation in a delivery auction
 * nets you nothing, so bidders shade down; the gap is the profit. Retuned against self-play in A5.
 */
export const BID_SHADING = 0.6;

/**
 * How close to true value a bot goes in a *runoff*. Higher than `BID_SHADING`: a runoff proves the
 * shaded opening bid wasn't enough, and the containers are about to go to someone else. Retuned in A5.
 */
export const RUNOFF_SHADING = 0.85;

/**
 * The highest bid the bot expects `cargo` to draw, given only public information.
 *
 * A card is secret, but a scoring *area* is not — containers sit face-up on Container Island, and so
 * does everyone's cash. So the bot can do better than a flat average: for each opponent it values the
 * cargo against **every card they might hold**, and averages. Cards the bot holds itself are excluded
 * — it knows nobody else has them. The winning bid is then the best of those estimates, capped by
 * what that opponent can actually pay.
 *
 * This mirrors `bidFor` exactly, just averaged over the unknown, which keeps the seller's expectation
 * and the buyers' behaviour consistent. It matters because a flat per-container average is wildly
 * wrong here: the discard rule means a hold full of one color is nearly worthless, and measured
 * self-play bids came in ~5× below what an averaged model predicted.
 */
export function expectedAuctionBid(ctx: Ctx, cargo: readonly Color[]): number {
  if (cargo.length === 0) {
    return 0;
  }
  let best = 0;
  for (const opponent of ctx.opponents) {
    const bid = Math.min(opponent.money, Math.floor(expectedValueFor(ctx, opponent, cargo) * BID_SHADING));
    best = Math.max(best, bid);
  }
  return best;
}

/**
 * What `cargo` is worth to one opponent, averaged over every card they might be holding.
 *
 * Their scoring *area* is public and their card is not, so this is the honest estimate: value the
 * cargo against each candidate card and average. Cards the bot holds itself are excluded — it knows
 * for certain nobody else has them.
 */
export function expectedValueFor(ctx: Ctx, opponent: PlayerView, cargo: readonly Color[]): number {
  const possibleCards = SCORING_CARDS.filter((card) => card.id !== ctx.me.scoringCard.id);
  const totalValue = possibleCards.reduce(
    (sum, card) => sum + Math.max(0, gainFrom({ ...opponent, scoringCard: card }, cargo)),
    0,
  );
  return totalValue / possibleCards.length;
}

/**
 * What one container in the hold is worth to a *deliverer*, used only for buy decisions.
 *
 * The marginal estimate above is the honest answer to "what will this hold fetch", but it is useless
 * for deciding whether to buy the *first* container: a lone container is its own discard, so it prices
 * at $0 and a greedy bot would never start a hold at all. This flat figure breaks that chicken-and-egg
 * — a container is worth buying if it costs less than it will eventually resell for.
 *
 * Calibrated from measured self-play (winning bids averaged ~$2.86 on ~2.4-container holds, so the
 * deliverer's doubled take is ~$2.35/container) and rounded up, since fuller scoring areas later in a
 * game bid higher. This is exactly the kind of number A5 exists to tune.
 */
export const RESALE_PER_CONTAINER = 3;
