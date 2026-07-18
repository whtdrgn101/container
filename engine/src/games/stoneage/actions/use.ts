import { GameError } from '../core';
import type { PlaceId, StoneAgePlayer, StoneAgeState } from '../core';
import { addTool, advanceActor, isUsePlace, record, withPlayer } from '../internal';

/**
 * Use a non-dice place (rulebook pg. 5–6):
 * - **tool maker** → take 1 tool (climbing the 1→2→3→4 ladder),
 * - **hut** → gain 1 more person for every future round,
 * - **field** → move up the food track (+1 food produced at the end of each round).
 *
 * The people are returned and the turn advances. (Tools acquired here add to dice rolls once spending
 * lands in SA4b.)
 */
export function use(state: StoneAgeState, playerId: string, place: PlaceId): StoneAgeState {
  if (!isUsePlace(place) || state.placements[place][playerId] === undefined) {
    throw new GameError('INVALID_USE', `Player "${playerId}" has no people to use at "${place}"`);
  }

  const seat = state.activePlayerIndex;
  const player = state.players[seat]!;
  let updated: StoneAgePlayer;
  switch (place) {
    case 'toolMaker': {
      const tools = addTool(player.tools);
      // A brand-new tool (the array grew) starts unused; an upgraded tool keeps its used state.
      const toolsUsed = tools.length > player.tools.length ? [...player.toolsUsed, false] : player.toolsUsed;
      updated = { ...player, tools, toolsUsed };
      break;
    }
    case 'hut':
      updated = { ...player, people: player.people + 1 };
      break;
    default: // field
      updated = { ...player, foodTrack: player.foodTrack + 1 };
      break;
  }

  const players = withPlayer(state, seat, updated);
  const { [playerId]: _removed, ...restOfPlace } = state.placements[place];
  const placements = { ...state.placements, [place]: restOfPlace };

  const after: StoneAgeState = { ...state, players, placements };
  return record(after, 'USE', playerId, advanceActor(after), { place });
}
