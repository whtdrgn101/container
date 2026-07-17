import { SHIP_CAPACITY } from '@game-hub/engine/container';
import type { Action } from '@game-hub/engine/container';
import type { Candidate, Ctx } from '../types';

/**
 * Where to sail. One hop per action, and a ship may only move ocean ↔ destination, so a round trip
 * costs several of the two actions a turn allows.
 *
 * These scores encode the single most important thing about the bot: **a loaded ship outranks
 * everything else.** Delivery is the game's scoring engine, but it is also its longest action chain
 * — dock, buy, back to the ocean, on to the island, auction. Scored naively, each individual hop
 * looks worse than just producing again, so a greedy bot produces forever and never sails. (It did:
 * an early self-play 5-player game ran 52 turns with *zero* deliveries.) Once cargo is aboard, every
 * remaining hop therefore outranks routine production, so a started voyage always finishes.
 */
export function rankSail(ctx: Ctx, action: Extract<Action, { type: 'SAIL' }>): Candidate | null {
  const cargo = ctx.me.ship.cargo;
  const to = action.to;

  switch (to.kind) {
    case 'island': {
      // Arriving with cargo forces the auction immediately and ends the turn, so only go when the
      // hold is worth selling — a fuller ship means a bigger bid and a bigger matching subsidy.
      if (cargo.length === 0) {
        return null;
      }
      return { action, score: 72 + 12 * cargo.length };
    }
    case 'bank': {
      // Only worth the trip to collect containers already won at auction.
      if (ctx.me.holdingArea.length === 0 || cargo.length >= SHIP_CAPACITY) {
        return null;
      }
      return { action, score: 52 };
    }
    case 'harbor': {
      if (cargo.length >= SHIP_CAPACITY) {
        return null;
      }
      const seller = ctx.view.players.find((player) => player.id === to.playerId);
      if (!seller || seller.harborStore.length === 0) {
        return null;
      }
      const cheapest = Math.min(...seller.harborStore.map((container) => container.price));
      if (cheapest > ctx.me.money) {
        return null;
      }
      // Below Produce: shopping is speculative, so the bot stocks its factory first and sails once
      // the district is full (which it is most turns, since storage is only 2 per factory).
      return { action, score: 40 + Math.min(seller.harborStore.length, 3) };
    }
    case 'ocean': {
      // The only route onward from a dock. With cargo aboard this is a leg of the delivery run and
      // must beat Produce, or the ship sits at the dock forever; empty, it's just leaving.
      return { action, score: cargo.length > 0 ? 60 + 10 * cargo.length : 9 };
    }
  }
}

/** Containers already won at the Bank are free to collect — always take them. */
export function rankLoadFromBank(action: Extract<Action, { type: 'LOAD_FROM_BANK' }>): Candidate {
  return { action, score: 88 };
}
