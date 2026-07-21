import { GameError, HUNT_THRESHOLD, PLACE_RESOURCE, RESOURCE_THRESHOLD } from '../core';
import type { StoneAgePlayer, StoneAgeState } from '../core';
import { advanceActor, record, seatOf, withPlayer } from '../internal';

/**
 * **Step 2 of a gather (pg. 5–6): take the yield.** Resolve the `pendingGather`, optionally adding the
 * player's tools to the dice total — each tool in `toolIndices` adds its value and is spent for the rest
 * of the round (pg. 5, "once per round"). Yield = total ÷ threshold (hunt → food per full 2; the four
 * resource places → their resource). The people are returned, the roll cleared, and the turn advances.
 */
export function takeGather(state: StoneAgeState, playerId: string, toolIndices: readonly number[]): StoneAgeState {
  const pending = state.pendingGather;
  if (!pending) {
    throw new GameError('INVALID_TAKE', `Player "${playerId}" has no rolled gather to take`);
  }

  // Seat from `playerId`, not `activePlayerIndex` — see `feed` for why (this is a public export).
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  // Validate the tool selection: unique, in range, and not already spent this round.
  const seen = new Set<number>();
  for (const i of toolIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= player.tools.length || player.toolsUsed[i] || seen.has(i)) {
      throw new GameError('INVALID_TAKE', `Tool ${i} is not an available tool to spend`);
    }
    seen.add(i);
  }

  const boost = toolIndices.reduce((sum, i) => sum + player.tools[i]!, 0);
  const total = pending.dice.reduce((sum, d) => sum + d, 0) + boost;
  const toolsUsed = player.toolsUsed.map((used, i) => used || seen.has(i));

  // The hunt yields food; every other gather place yields its resource.
  let updated: StoneAgePlayer;
  let kind: string;
  let amount: number;
  if (pending.place === 'hunt') {
    amount = Math.floor(total / HUNT_THRESHOLD);
    kind = 'food';
    updated = { ...player, food: player.food + amount, toolsUsed };
  } else {
    const resource = PLACE_RESOURCE[pending.place];
    amount = Math.floor(total / RESOURCE_THRESHOLD[resource]);
    kind = resource;
    updated = { ...player, resources: { ...player.resources, [resource]: player.resources[resource] + amount }, toolsUsed };
  }

  const players = withPlayer(state, seat, updated);
  // Return this group's people and clear the pending roll.
  const { [playerId]: _removed, ...restOfPlace } = state.placements[pending.place];
  const placements = { ...state.placements, [pending.place]: restOfPlace };

  const after: StoneAgeState = { ...state, players, placements, pendingGather: null };
  return record(after, 'TAKE', playerId, advanceActor(after), { place: pending.place, dice: pending.dice, boost, amount, kind });
}
