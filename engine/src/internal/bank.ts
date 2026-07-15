import type { BankState, Color, PlayerState } from '../core';

/** Distribute `amount` in $1 steps across the Bank cash lots, cycling I→II→III→I… (rulebook pg. 14). */
export function payToBankCash(cashLots: readonly number[], amount: number): number[] {
  const lots = [...cashLots];
  for (let placed = 0; placed < amount; placed += 1) {
    lots[placed % lots.length]! += 1;
  }
  return lots;
}

/** Container lots currently tied up by an active auction (skipped when distributing to the Bank). */
export function tokenedContainerLots(bank: BankState): ReadonlySet<number> {
  return new Set(bank.auctions.filter((a) => a.lotKind === 'container').map((a) => a.lotIndex));
}

/** Distribute containers one at a time across the Bank container lots, skipping tokened lots. */
export function payToBankContainers(
  containerLots: readonly (readonly Color[])[],
  containers: readonly Color[],
  skip: ReadonlySet<number>,
): Color[][] {
  const lots = containerLots.map((lot) => [...lot]);
  let cursor = 0;
  for (const container of containers) {
    while (skip.has(cursor % lots.length)) {
      cursor += 1;
    }
    lots[cursor % lots.length]!.push(container);
    cursor += 1;
  }
  return lots;
}

/**
 * Resolve any container-lot auctions the active player leads at the start of their turn (rulebook
 * turn step 2): the reserved cash bid is distributed into the Bank's cash lots and the won containers
 * go to the player's holding area. The token and auction are cleared.
 */
export function resolveBankWins(
  bank: BankState,
  players: readonly PlayerState[],
  activeIndex: number,
): { players: readonly PlayerState[]; bank: BankState } {
  const activeId = players[activeIndex]!.id;
  const won = bank.auctions.filter((auction) => auction.highBidderId === activeId);
  if (won.length === 0) {
    return { players, bank };
  }

  let cashLots = [...bank.cashLots];
  const containerLots = bank.containerLots.map((lot) => [...lot]);
  let tokens = bank.tokens;
  const wonContainers: Color[] = [];
  for (const auction of won) {
    cashLots = payToBankCash(cashLots, auction.bid);
    wonContainers.push(...containerLots[auction.lotIndex]!);
    containerLots[auction.lotIndex] = [];
    tokens += 1;
  }

  const updatedPlayers = players.map((player) =>
    player.id === activeId ? { ...player, holdingArea: [...player.holdingArea, ...wonContainers] } : player,
  );
  return {
    players: updatedPlayers,
    bank: { cashLots, containerLots, tokens, auctions: bank.auctions.filter((a) => a.highBidderId !== activeId) },
  };
}
