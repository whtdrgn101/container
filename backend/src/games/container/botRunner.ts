import { bidFor, chooseTiedWinner, contextFor, decide, runoffBidFor, wantsBuyout } from '@container/bot';
import { applyAction, viewFor } from '@container/engine/container';
import type { GameState } from '@container/engine/container';
import type { BotRepository } from '../../bots';
import type { AuctionRepository, DeliveryAuction } from './auctions';
import { applyBid, biddersFor, outcomeOf, syncAuction, tiedForLead } from './auctions';

/**
 * Told that a bot changed the game, so the world can be brought up to date. Injected rather than
 * reaching for the hub, so the runner stays testable without a socket and knows nothing about
 * transports.
 *
 * It takes only the state: every path below **saves the auction before notifying**, so the listener
 * can re-derive it with `syncAuction` and there is no second copy to keep in step. (That is what the
 * Container module's `onStateChanged` does — one auction-push implementation for bots and humans.)
 */
export type BotChangeListener = (state: GameState) => void;

/**
 * The slice of persistence the runner needs, typed to Container. The module's `ModuleContext.games`
 * is `unknown`-shaped (it's the shared contract); this is the same thing with the cast done once, at
 * the boundary where we know what we wrote.
 */
export interface ContainerGames {
  get(gameId: string): GameState | undefined;
  update(state: GameState): void;
}

/**
 * Far more actions than a real run of bot turns could need. This is a runaway guard, not a budget:
 * an all-bot game legitimately plays itself out in a few hundred actions.
 */
const MAX_STEPS = 2000;

/**
 * Drives the seats an AI holds (Track A2).
 *
 * Server-side on purpose: one implementation serves hotseat *and* remote play, and a game keeps
 * moving even with every browser closed. `tick` is called after any mutation and plays bots forward
 * until it's a human's move again — synchronously, because the engine and SQLite both are, so a
 * caller can simply read the game back afterwards and reply with it.
 *
 * The runner has no special powers. It builds actions with the same `@container/bot` policies used
 * in self-play, hands them to the same `applyAction` a human's move goes through, and bids through
 * the same `applyBid` the REST route uses. A bot cannot do anything a player at the table couldn't —
 * and it decides from `viewFor(state, botId)`, so it cannot see an opponent's card either.
 */
export class BotRunner {
  constructor(
    private readonly repo: ContainerGames,
    private readonly bots: BotRepository,
    private readonly auctions: AuctionRepository,
    private readonly onChange: BotChangeListener,
  ) {}

  /**
   * Play every bot seat that is ready to act, stopping as soon as the game is waiting on a human
   * (their turn, their bid, or their call on a delivery). Safe to call when there are no bots, when
   * it's already a human's turn, or on a finished game — it simply does nothing.
   */
  tick(gameId: string): void {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      const state = this.repo.get(gameId);
      if (!state || state.status !== 'active') return;

      const botIds = new Set(this.bots.listForGame(gameId));
      if (botIds.size === 0) return;

      // A pending auction outranks the turn: everyone owes a bid before the deliverer can act.
      const auction = syncAuction(this.auctions, state);
      if (auction) {
        if (!this.advanceAuction(state, auction, botIds)) return; // waiting on a human
        continue;
      }

      const active = state.players[state.activePlayerIndex]!;
      if (!botIds.has(active.id)) return; // a human's move

      // No `collectBids`: a bot at the island is handled by the auction above, never here.
      this.applyBotAction(state, active.id);
    }
  }

  /** Take the one next bot step an open auction is waiting for. False ⇒ it's a human's move. */
  private advanceAuction(state: GameState, auction: DeliveryAuction, botIds: Set<string>): boolean {
    if (auction.phase === 'bidding') {
      const next = biddersFor(state, auction.delivererId).find(
        (id) => botIds.has(id) && auction.bids[id] === undefined,
      );
      if (!next) return false;
      return this.placeBotBid(state, auction, next, bidFor(viewFor(state, next), next));
    }

    if (auction.phase === 'runoff') {
      const next = tiedForLead(auction, state).find(
        (id) => botIds.has(id) && auction.runoffBids[id] === undefined,
      );
      if (!next) return false;
      const extra = runoffBidFor(viewFor(state, next), next, auction.bids[next] ?? 0);
      return this.placeBotBid(state, auction, next, extra);
    }

    // Every bid is in — only the deliverer can settle it.
    if (!botIds.has(auction.delivererId)) return false;
    this.resolveAsBot(state, auction);
    return true;
  }

  /** Bid for one bot seat through the same path a human's bid takes. */
  private placeBotBid(state: GameState, auction: DeliveryAuction, playerId: string, bid: number): boolean {
    const outcome = applyBid(auction, state, playerId, bid);
    if (!outcome.ok) {
      // The bot proposed a bid the rules refuse (it can't afford it, say). Rather than wedge the
      // auction, treat it as the $0 bluff it can always legally make.
      const fallback = applyBid(auction, state, playerId, 0);
      if (!fallback.ok) return false;
      this.auctions.save(fallback.auction);
      this.onChange(state);
      return true;
    }
    this.auctions.save(outcome.auction);
    this.onChange(state);
    return true;
  }

  /** A bot deliverer settles its own auction: take the money, or buy the cargo out. */
  private resolveAsBot(state: GameState, auction: DeliveryAuction): void {
    const view = viewFor(state, auction.delivererId);
    const ctx = contextFor(view, auction.delivererId);
    const { winningBid, finalists } = outcomeOf(auction, state);

    const buyout = wantsBuyout(ctx, winningBid);
    // A runoff that stayed level is the deliverer's call (pg. 16) — even when the deliverer is a bot.
    const chosenWinnerId =
      !buyout && finalists.length > 1 ? chooseTiedWinner(ctx, finalists, auction.cargo) : undefined;

    const next = applyAction(state, auction.delivererId, {
      type: 'DELIVER',
      bids: auction.bids,
      runoffBids: auction.runoffBids,
      ...(buyout ? { buyout: true } : {}),
      ...(chosenWinnerId ? { chosenWinnerId } : {}),
    });
    this.repo.update(next);
    this.auctions.clear(auction.gameId);
    this.onChange(next);
  }

  /** Play one ordinary bot turn action. */
  private applyBotAction(state: GameState, playerId: string): void {
    const action = decide(viewFor(state, playerId), playerId);
    const next = applyAction(state, playerId, action);
    this.repo.update(next);
    // Sync before notifying: an action that docks a loaded ship at the island *opens* the auction,
    // and the listener re-derives it from the saved row.
    syncAuction(this.auctions, next);
    this.onChange(next);
  }
}
