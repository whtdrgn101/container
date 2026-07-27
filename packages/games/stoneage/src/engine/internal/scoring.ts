import { RESOURCES } from '../core';
import type { ScoreBreakdown, StoneAgePlayer, StoneAgeResult, StoneAgeState } from '../core';
import { civCardById } from './cards';

/**
 * Final scoring for one player (rulebook pg. 8, SA11). Adds to the points already banked during the game
 * (`score`): green culture cards score the count of *distinct* symbols squared; each sand multiplier
 * card multiplies a player quantity (farmers × food-track, tool-makers × tool value, hut-builders ×
 * buildings, shamen × people); and every leftover resource is worth 1 (food doesn't score).
 */
export function scorePlayer(player: StoneAgePlayer): ScoreBreakdown {
  const symbols = new Set<string>();
  let farmerCards = 0;
  let toolMakerCards = 0;
  let builderCards = 0;
  let shamanCards = 0;
  for (const id of player.civCards) {
    const { scoring } = civCardById(id);
    switch (scoring.kind) {
      case 'green':
        symbols.add(scoring.symbol);
        break;
      case 'farmer':
        farmerCards += 1;
        break;
      case 'toolMaker':
        toolMakerCards += 1;
        break;
      case 'builder':
        builderCards += 1;
        break;
      default: // 'shaman'
        shamanCards += 1;
        break;
    }
  }

  const toolValue = player.tools.reduce((sum, value) => sum + value, 0);
  const green = symbols.size * symbols.size;
  const farmers = farmerCards * player.foodTrack;
  const toolMakers = toolMakerCards * toolValue;
  const builders = builderCards * player.buildings;
  const shamen = shamanCards * player.people;
  const resources = RESOURCES.reduce((sum, r) => sum + player.resources[r], 0);
  const total = player.score + green + farmers + toolMakers + builders + shamen + resources;

  return { base: player.score, green, farmers, toolMakers, builders, shamen, resources, total };
}

/** A player's tiebreak value (pg. 8): highest total food production + tools + people wins ties. */
function tiebreak(player: StoneAgePlayer): number {
  return player.foodTrack + player.tools.reduce((sum, value) => sum + value, 0) + player.people;
}

/**
 * Score the whole game (pg. 8): a result per player and the winner(s) — highest total, then the food +
 * tools + people tiebreak, sharing a win if still level. The results keep the players' seat order.
 */
export function finalScoring(state: StoneAgeState): { results: StoneAgeResult[]; winnerIds: string[] } {
  const results: StoneAgeResult[] = state.players.map((player) => ({
    playerId: player.id,
    total: scorePlayer(player).total,
    breakdown: scorePlayer(player),
  }));

  const best = Math.max(...results.map((r) => r.total));
  const topScorers = state.players.filter((_, i) => results[i]!.total === best);
  const bestTiebreak = Math.max(...topScorers.map(tiebreak));
  const winnerIds = topScorers.filter((player) => tiebreak(player) === bestTiebreak).map((player) => player.id);

  return { results, winnerIds };
}
