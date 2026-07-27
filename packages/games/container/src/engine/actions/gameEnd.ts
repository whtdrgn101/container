import { COLORS, LOAN_ENDGAME_COST } from '../core';
import type { BankState, Color, GameState, PlayerScore, PlayerState, Supply } from '../core';

/** Leftover-container values at game end (rulebook pg. 18). */
const LEFTOVER_SHIP_HOLDING = 3; // per container on your ship or in your Bank holding area
const LEFTOVER_HARBOR = 2; // per container in your harbor district
/** A two-value container is worth $10 if you collected every color, else $5 (rulebook pg. 18). */
const TWO_VALUE_FULL = 10;
const TWO_VALUE_BASE = 5;

/** How many container colors the supply has run out of. The game ends when this reaches 2. */
export function exhaustedColorCount(supply: Supply): number {
  return COLORS.filter((color) => supply.containers[color] === 0).length;
}

/** Score one player's board per the rulebook (pg. 18). Pure. */
function scorePlayer(player: PlayerState): PlayerScore {
  const card = player.scoringCard;
  const area = player.scoringArea;

  let discardedColor: Color | null = null;
  let islandScore = 0;
  if (area.length > 0) {
    const counts = {} as Record<Color, number>;
    for (const color of COLORS) {
      counts[color] = 0;
    }
    for (const color of area) {
      counts[color] += 1;
    }

    // Step 1: discard your most-common color. On a tie you choose the lowest-value color to discard
    // — unless your two-value color is among the tied, which you must discard.
    const maxCount = Math.max(...COLORS.map((color) => counts[color]));
    const tied = COLORS.filter((color) => counts[color] === maxCount);
    discardedColor = tied.includes(card.twoValueColor)
      ? card.twoValueColor
      : tied.reduce((best, color) => (card.values[color] < card.values[best] ? color : best), tied[0]!);

    // Step 2: score the rest. The two-value color is worth $10 only if you collected every color
    // (including the discarded one, i.e. the original scoring area).
    const twoValue = COLORS.every((color) => counts[color] > 0) ? TWO_VALUE_FULL : TWO_VALUE_BASE;
    for (const color of area) {
      if (color === discardedColor) {
        continue;
      }
      islandScore += color === card.twoValueColor ? twoValue : card.values[color];
    }
  }

  const leftover =
    (player.ship.cargo.length + player.holdingArea.length) * LEFTOVER_SHIP_HOLDING +
    player.harborStore.length * LEFTOVER_HARBOR;
  const loanPenalty = player.loans * LOAN_ENDGAME_COST;
  const total = player.money + islandScore + leftover - loanPenalty;

  return { playerId: player.id, cash: player.money, islandScore, leftover, loanPenalty, total, discardedColor };
}

/** Score every player. */
export function finalScoring(players: readonly PlayerState[]): PlayerScore[] {
  return players.map(scorePlayer);
}

/** Winner(s): highest total; ties broken by most factory-district containers; still tied → shared. */
function determineWinners(results: readonly PlayerScore[], players: readonly PlayerState[]): string[] {
  const maxTotal = Math.max(...results.map((r) => r.total));
  let contenders = results.filter((r) => r.total === maxTotal);
  if (contenders.length > 1) {
    const factoryCount = (id: string) => players.find((p) => p.id === id)!.factoryStore.length;
    const maxFactory = Math.max(...contenders.map((r) => factoryCount(r.playerId)));
    contenders = contenders.filter((r) => factoryCount(r.playerId) === maxFactory);
  }
  return contenders.map((r) => r.playerId);
}

/**
 * End the game (rulebook pg. 17–18): resolve any open Bank auctions (each high bidder wins its
 * containers into their holding area), then score everyone and determine the winner(s). Returns the
 * resolved players plus the ended-state fields to apply.
 */
export function endGame(
  state: GameState,
  players: readonly PlayerState[],
  bank: BankState,
): { players: readonly PlayerState[]; extra: Partial<GameState> } {
  // Award any live auctions to their current high bidder.
  const wonByPlayer = new Map<string, Color[]>();
  for (const auction of bank.auctions) {
    const containers = bank.containerLots[auction.lotIndex]!;
    const alreadyWon = wonByPlayer.get(auction.highBidderId) ?? [];
    wonByPlayer.set(auction.highBidderId, [...alreadyWon, ...containers]);
  }
  const resolvedPlayers = players.map((player) =>
    wonByPlayer.has(player.id)
      ? { ...player, holdingArea: [...player.holdingArea, ...wonByPlayer.get(player.id)!] }
      : player,
  );

  const results = finalScoring(resolvedPlayers);
  const winnerIds = determineWinners(results, resolvedPlayers);
  const clearedBank: BankState = {
    ...bank,
    auctions: [],
    containerLots: bank.containerLots.map((lot, index) => (bank.auctions.some((a) => a.lotIndex === index) ? [] : lot)),
  };

  return { players: resolvedPlayers, extra: { status: 'ended', results, winnerIds, bank: clearedBank } };
}
