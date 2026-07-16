import { legalActions } from '@container/engine';
import type { Action, GameState, GameView } from '@container/engine';
import { wantsBuyout } from './bid';
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

  const bids = options.collectBids(ctx.me.ship.cargo);
  const winningBid = Math.max(0, ...ctx.opponents.map((opponent) => bids[opponent.id] ?? 0));
  const buyout = wantsBuyout(ctx, winningBid);

  // No `runoffBids`: a tie among the bids resolves to the earliest seat, which is the engine's own
  // documented simplification of "the deliverer chooses". Revisit with A1's real bid round-trip.
  return buyout ? { type: 'DELIVER', bids, buyout: true } : { type: 'DELIVER', bids };
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
  const me = selfOf(view, playerId);
  if (view.status === 'ended') {
    throw new BotError(`Game "${view.id}" has ended — there is nothing to decide`);
  }

  const active = view.players[view.activePlayerIndex];
  if (!active || active.id !== playerId) {
    throw new BotError(`It is not bot seat "${playerId}"'s turn (active seat is "${active?.id ?? 'none'}")`);
  }

  const ctx: Ctx = { view, me, opponents: view.players.filter((player) => player.id !== playerId) };

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
