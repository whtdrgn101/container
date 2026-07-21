import { GameError, MAX_FOOD_TRACK, MAX_PEOPLE } from '../core';
import type { PlaceId, StoneAgePlayer, StoneAgeState } from '../core';
import { addTool, advanceActor, isUsePlace, record, seatOf, withPlayer } from '../internal';

/**
 * Use a non-dice place (rulebook pg. 5–6):
 * - **tool maker** → take 1 tool (climbing the 1→2→3→4 ladder),
 * - **hut** → gain 1 more person for every future round — while the general supply lasts
 *   (`MAX_PEOPLE`, pg. 2),
 * - **field** → move up the food track (+1 food produced at the end of each round), to the top of the
 *   printed track (`MAX_FOOD_TRACK`, pg. 2).
 *
 * At a cap the use is a no-op, like the 13th tool — placing there stays legal (it still blocks the
 * spot), you just gain nothing. The people are returned and the turn advances.
 */
export function use(state: StoneAgeState, playerId: string, place: PlaceId): StoneAgeState {
  if (!isUsePlace(place) || state.placements[place][playerId] === undefined) {
    throw new GameError('INVALID_USE', `Player "${playerId}" has no people to use at "${place}"`);
  }

  // Seat from `playerId`, not `activePlayerIndex` — see `feed` for why (this is a public export).
  const seat = seatOf(state, playerId);
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
      updated = { ...player, people: Math.min(player.people + 1, MAX_PEOPLE) };
      break;
    default: // field
      updated = { ...player, foodTrack: Math.min(player.foodTrack + 1, MAX_FOOD_TRACK) };
      break;
  }

  const players = withPlayer(state, seat, updated);
  const { [playerId]: _removed, ...restOfPlace } = state.placements[place];
  const placements = { ...state.placements, [place]: restOfPlace };

  const after: StoneAgeState = { ...state, players, placements };
  return record(after, 'USE', playerId, advanceActor(after), { place });
}
