import { GameError } from '../core';
import type { BankAuction, GameState, PlayerState } from '../core';
import { record, seatOf } from '../internal';

/**
 * Call Bank action (rulebook pg. 12) on a **container lot** — bid cash to win its containers. Either
 * start a new auction (needs an auction token and any $1+ opening bid) or outbid the current leader
 * ($1+ higher). Your bid is reserved off your hand; if outbid you get it back. (Cash-lot auctions —
 * bidding containers for cash — are Slice 6c.)
 */
export function callBank(state: GameState, playerId: string, lotIndex: number, bid: number): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const bank = state.bank;

  if (lotIndex < 0 || lotIndex >= bank.containerLots.length || bank.containerLots[lotIndex]!.length === 0) {
    throw new GameError('INVALID_BANK_LOT', `Bank container lot ${lotIndex} is empty or invalid`);
  }

  const existing = bank.auctions.find((a) => a.lotKind === 'container' && a.lotIndex === lotIndex);
  if (existing) {
    if (bid <= existing.bid) {
      throw new GameError('BID_TOO_LOW', `Bid must be at least $${existing.bid + 1}`);
    }
  } else {
    if (bank.tokens <= 0) {
      throw new GameError('NO_AUCTION_TOKEN', 'No auction token available to start a new auction');
    }
    if (bid < 1) {
      throw new GameError('BID_TOO_LOW', 'Opening bid must be at least $1');
    }
  }
  if (player.money < bid) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford a $${bid} bid`);
  }

  // Refund the previous leader (if any) and reserve the new bid from the bidder's hand.
  const players: PlayerState[] = state.players.map((current) => {
    let money = current.money;
    if (existing && current.id === existing.highBidderId) {
      money += existing.bid;
    }
    if (current.id === playerId) {
      money -= bid;
    }
    return money === current.money ? current : { ...current, money };
  });

  const auction: BankAuction = { lotKind: 'container', lotIndex, highBidderId: playerId, bid, reserved: [] };
  const bankAfter = existing
    ? { ...bank, auctions: bank.auctions.map((a) => (a === existing ? auction : a)) }
    : { ...bank, tokens: bank.tokens - 1, auctions: [...bank.auctions, auction] };

  return record(state, players, 'CALL_BANK', playerId, { bank: bankAfter }, { lotIndex, bid });
}
