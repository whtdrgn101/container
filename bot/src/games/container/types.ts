import type { Action, Color, GameView, PlayerState, PlayerView } from '@game-hub/engine/container';

/** `decide`'s signature — the on-turn half of a Container seat's policy. */
export type DecideFn = (view: GameView, playerId: string, options?: DecideOptions) => Action;

/** `bidFor`'s signature — a seat's sealed opening bid, decided from that seat's own view. */
export type BidFn = (view: GameView, bidderId: string) => number;

/** `runoffBidFor`'s signature — a seat's extra runoff cash on top of its opening bid. */
export type RunoffBidFn = (view: GameView, bidderId: string, openingBid: number) => number;

/**
 * A complete Container seat policy: how it plays on its turn (`decide`) **and** how it bids in someone
 * else's delivery auction (`bidFor`/`runoffBidFor`). Container is the one game where a seat's opinions
 * are more than a single `decide` — its sealed bids come from its own view, so a benchmark that pits
 * two policies must route each seat's bids through *that seat's* policy, not a shared one. Self-play's
 * `policies` map (and the strength bench) key one of these per seat.
 */
export interface SeatPolicy {
  readonly decide: DecideFn;
  readonly bidFor: BidFn;
  readonly runoffBidFor: RunoffBidFn;
}

/**
 * Resolves every opponent's sealed bid when a bot must run a delivery auction.
 *
 * The bot cannot produce these itself: bids are secret, and a human's bid is only knowable by asking
 * that human. Bid collection therefore belongs to the caller — the backend's pending delivery auction
 * (roadmap A1). Self-play supplies one built from the bots' own `bidFor`.
 *
 * Returns a map of opponent player id → cash bid. A missing entry is a legal $0 bluff.
 */
export type BidCollector = (cargo: readonly Color[]) => Readonly<Record<string, number>>;

/**
 * Resolves the extra cash each tied player adds in a runoff (pg. 16), keyed by player id.
 * Like the opening bids, these are secret and belong to the bidders — the bot must ask.
 */
export type RunoffCollector = (
  cargo: readonly Color[],
  tied: readonly string[],
) => Readonly<Record<string, number>>;

export interface DecideOptions {
  readonly collectBids?: BidCollector;
  /** Omit and a tie is bid out at $0 all round, leaving the deliverer to break it. */
  readonly collectRunoffBids?: RunoffCollector;
}

/**
 * Everything a policy needs, resolved once per decision.
 *
 * `me` is a full `PlayerState` because the bot's *own* seat is never redacted in its own view — that
 * is exactly the guarantee `selfOf` checks. Opponents stay `PlayerView` (their `scoringCard` is
 * `null`), so the type system stops a policy from reading information the bot has not earned.
 */
export interface Ctx {
  readonly view: GameView;
  readonly me: PlayerState;
  readonly opponents: readonly PlayerView[];
}

/**
 * A legal action the bot has fully parameterized, plus how much it wants to play it.
 *
 * Scores are only ever compared against each other within one decision — they are an ordering, not a
 * currency, so don't read meaning into an absolute value. `END_TURN` sits at 0 and is the baseline:
 * a policy returning `null` declines the action, and anything scoring at or below 0 loses to simply
 * ending the turn.
 */
export interface Candidate {
  readonly action: Action;
  readonly score: number;
}
