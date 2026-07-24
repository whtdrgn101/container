import { deliveryOutcome, legalActions } from '@game-hub/engine/container';
import type { Action, GameState, GameView } from '@game-hub/engine/container';
import { assertBotTurn } from '../../kernel';
import { chooseTiedWinner, wantsBuyout } from './bid';
import { contextFor } from './context';
import { BotError } from './errors';
import { rank } from './policies/rank';
import type { Candidate, Ctx, DecideOptions } from './types';
import { selfOf } from './valuation';

/**
 * Build the DELIVER action that resolves this bot's forced delivery auction.
 *
 * The bot cannot invent the bids: they are sealed, and a human's bid is only knowable by asking that
 * human. So collection is the caller's job and the bot refuses loudly without it. Self-play wires
 * `collectBids` to the other bots' `bidFor`; the backend will wire it to the pending delivery
 * auction (roadmap A1), which is the whole reason A1 blocks bots taking remote seats.
 */
function buildDelivery(ctx: Ctx, options: DecideOptions): Action {
  if (!options.collectBids) {
    throw new BotError(
      `Bot seat "${ctx.me.id}" must resolve a delivery auction, but no collectBids was supplied. ` +
        'Sealed bids can only come from the other players, so the caller must collect them.',
    );
  }

  const cargo = ctx.me.ship.cargo;
  const state = ctx.view as unknown as GameState;
  const bids = options.collectBids(cargo);

  // A tie sends it to a runoff (pg. 16). The tied players' extra cash is theirs to decide, so — like
  // the opening bids — the bot has to ask for it rather than invent it.
  const opening = deliveryOutcome(state, ctx.me.id, bids);
  const runoffBids = opening.finalists.length > 1 ? (options.collectRunoffBids?.(cargo, opening.finalists) ?? {}) : {};

  // Ask the engine how this actually resolves rather than re-deriving the tie rule here — the bot
  // must agree with `deliver` exactly, or it will offer a choice the engine rejects (or skip one it
  // demands).
  const { winningBid, finalists } = deliveryOutcome(state, ctx.me.id, bids, runoffBids);
  const buyout = wantsBuyout(ctx, winningBid);

  // Still level after the runoff and not buying out? Then the cargo is the deliverer's to award.
  const chosenWinnerId = !buyout && finalists.length > 1 ? chooseTiedWinner(ctx, finalists, cargo) : undefined;

  return {
    type: 'DELIVER',
    bids,
    ...(Object.keys(runoffBids).length > 0 ? { runoffBids } : {}),
    ...(buyout ? { buyout: true } : {}),
    ...(chosenWinnerId ? { chosenWinnerId } : {}),
  };
}

/**
 * Choose this bot's next action.
 *
 * `view` **must** be `viewFor(state, playerId)` — the bot's own redacted view. Handing it the full
 * `GameState` would let every policy read opponents' secret scoring cards, so taking a `GameView`
 * makes cheating impossible by construction rather than by discipline. `selfOf` enforces the other
 * half: the bot's own card must be visible, or the caller passed the wrong view.
 *
 * The returned action is always fully parameterized and legal for `applyAction`.
 */
export function decide(view: GameView, playerId: string, options: DecideOptions = {}): Action {
  // `selfOf` runs first: it enforces that the bot's *own* card is visible (the caller passed the
  // right view), independent of the shared turn checks.
  selfOf(view, playerId);
  assertBotTurn(view, playerId);

  const ctx = contextFor(view, playerId);

  // Safe cast: `legalActions` enumerates moves and never reads a scoring card, so a redacted view
  // produces the same list as the full state. (The UI relies on this too.) Keeping the cast here,
  // behind the one call that needs it, stops `GameState` leaking into the policies.
  const legal = legalActions(view as unknown as GameState);
  if (legal.length === 0) {
    throw new BotError(`No legal actions for bot seat "${playerId}"`);
  }
  if (legal.length === 1 && legal[0]!.type === 'DELIVER') {
    return buildDelivery(ctx, options);
  }

  let best: Candidate | null = null;
  for (const action of legal) {
    const candidate = rank(ctx, action);
    // Strictly greater keeps the first-listed action on ties, so decisions stay deterministic and
    // a bug reproduces from the same state every time.
    if (candidate && (!best || candidate.score > best.score)) {
      best = candidate;
    }
  }
  if (!best) {
    throw new BotError(`Every policy declined for bot seat "${playerId}" — END_TURN should always rank`);
  }
  return best.action;
}
