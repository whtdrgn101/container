import { GameError } from '../core';
import type { BankAuction, GameState, PlayerState, StoredContainer } from '../core';
import { record, removeFromBoard, seatOf } from '../internal';

/** Starting a new auction needs a token and no existing auction of the same type (rulebook pg. 14). */
function assertCanStart(state: GameState, lotKind: 'container' | 'cash'): void {
  if (state.bank.tokens <= 0) {
    throw new GameError('NO_AUCTION_TOKEN', 'No auction token available to start a new auction');
  }
  if (state.bank.auctions.some((a) => a.lotKind === lotKind)) {
    throw new GameError('AUCTION_TYPE_LIMIT', `A ${lotKind} auction is already active`);
  }
}

/** Place the new/updated auction on the bank and consume a token if it's a fresh auction. */
function withAuction(state: GameState, existing: BankAuction | undefined, auction: BankAuction) {
  const bank = state.bank;
  return existing
    ? { ...bank, auctions: bank.auctions.map((a) => (a === existing ? auction : a)) }
    : { ...bank, tokens: bank.tokens - 1, auctions: [...bank.auctions, auction] };
}

/** Container lot: bid cash to win the containers. */
function callBankContainer(state: GameState, playerId: string, lotIndex: number, bid: number): GameState {
  const player = state.players[seatOf(state, playerId)]!;
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
    assertCanStart(state, 'container');
    if (bid < 1) {
      throw new GameError('BID_TOO_LOW', 'Opening bid must be at least $1');
    }
  }
  if (player.money < bid) {
    throw new GameError('INSUFFICIENT_FUNDS', `Player "${playerId}" cannot afford a $${bid} bid`);
  }

  // Refund the previous leader and reserve the new bid from the bidder's hand.
  const players = state.players.map((current) => {
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
  return record(
    state,
    players,
    'CALL_BANK',
    playerId,
    { bank: withAuction(state, existing, auction) },
    { lotKind: 'container', lotIndex, bid },
  );
}

/** Cash lot: bid containers (removed from your board) to win the cash. Only the count matters. */
function callBankCash(
  state: GameState,
  playerId: string,
  lotIndex: number,
  containerBid: readonly StoredContainer[],
): GameState {
  const player = state.players[seatOf(state, playerId)]!;
  const bank = state.bank;

  if (lotIndex < 0 || lotIndex >= bank.cashLots.length || bank.cashLots[lotIndex]! === 0) {
    throw new GameError('INVALID_BANK_LOT', `Bank cash lot ${lotIndex} is empty or invalid`);
  }
  const count = containerBid.length;
  const existing = bank.auctions.find((a) => a.lotKind === 'cash' && a.lotIndex === lotIndex);
  if (existing) {
    if (count <= existing.bid) {
      throw new GameError('BID_TOO_LOW', `Bid must be at least ${existing.bid + 1} containers`);
    }
  } else {
    assertCanStart(state, 'cash');
    if (count < 1) {
      throw new GameError('BID_TOO_LOW', 'Opening bid must be at least 1 container');
    }
  }

  const removed = removeFromBoard(player.factoryStore, player.harborStore, containerBid);
  if (!removed) {
    throw new GameError('INVALID_SELECTION', 'Those containers are not on your board');
  }

  // Return the previous leader's reserved containers (to their factory) and pull the new bidder's.
  const players: PlayerState[] = state.players.map((current) => {
    if (existing && current.id === existing.highBidderId) {
      return { ...current, factoryStore: [...current.factoryStore, ...existing.reserved] };
    }
    if (current.id === playerId) {
      return { ...current, factoryStore: removed.factoryStore, harborStore: removed.harborStore };
    }
    return current;
  });

  const auction: BankAuction = {
    lotKind: 'cash',
    lotIndex,
    highBidderId: playerId,
    bid: count,
    reserved: [...containerBid],
  };
  return record(
    state,
    players,
    'CALL_BANK',
    playerId,
    { bank: withAuction(state, existing, auction) },
    { lotKind: 'cash', lotIndex, count },
  );
}

/**
 * Call Bank action (rulebook pg. 12): start or bid in a Bank auction. On a **container lot** you bid
 * cash (`bid`) to win the containers; on a **cash lot** you bid containers (`containerBid`) to win the
 * cash. You win at the start of your next turn if still leading (see `resolveBankWins`).
 */
export function callBank(
  state: GameState,
  playerId: string,
  lotIndex: number,
  lotKind: 'container' | 'cash',
  bid?: number,
  containerBid?: readonly StoredContainer[],
): GameState {
  if (lotKind === 'cash') {
    if (containerBid === undefined) {
      throw new GameError('INVALID_SELECTION', 'A cash-lot bid requires containers');
    }
    return callBankCash(state, playerId, lotIndex, containerBid);
  }
  if (bid === undefined) {
    throw new GameError('BID_TOO_LOW', 'A container-lot bid requires a cash amount');
  }
  return callBankContainer(state, playerId, lotIndex, bid);
}
