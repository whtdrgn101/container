import { DIE_FACES, GameError, PLACE_RESOURCE, RESOURCE_THRESHOLD } from '../core';
import type { PlaceId, StoneAgeState } from '../core';
import { advanceActor, isResourcePlace, record, withPlayer } from '../internal';

/**
 * Gather a resource from a placed group (rulebook pg. 6). Roll one die per person on the place (the
 * dice are injected — the engine stays pure), sum them, and take 1 resource per "full N" (wood 3 /
 * brick 4 / stone 5 / gold 6). The people are returned (the placement is removed) and the turn advances.
 *
 * *(Tools — which add to the total — arrive with SA4, since you can't own any yet.)*
 */
export function gather(state: StoneAgeState, playerId: string, place: PlaceId, dice: readonly number[]): StoneAgeState {
  if (!isResourcePlace(place) || state.placements[place][playerId] === undefined) {
    throw new GameError('INVALID_GATHER', `Player "${playerId}" has no people to gather at "${place}"`);
  }
  const people = state.placements[place][playerId]!;
  const valid = dice.length === people && dice.every((d) => Number.isInteger(d) && d >= 1 && d <= DIE_FACES);
  if (!valid) {
    throw new GameError('INVALID_GATHER', `A gather at "${place}" needs ${people} dice of 1–${DIE_FACES}`);
  }

  const resource = PLACE_RESOURCE[place];
  const total = dice.reduce((sum, d) => sum + d, 0);
  const amount = Math.floor(total / RESOURCE_THRESHOLD[resource]);

  const seat = state.activePlayerIndex;
  const player = state.players[seat]!;
  const players = withPlayer(state, seat, {
    ...player,
    resources: { ...player.resources, [resource]: player.resources[resource] + amount },
  });
  // Return this group's people by removing the placement.
  const { [playerId]: _removed, ...restOfPlace } = state.placements[place];
  const placements = { ...state.placements, [place]: restOfPlace };

  const afterGather: StoneAgeState = { ...state, players, placements };
  return record(afterGather, 'GATHER', playerId, advanceActor(afterGather), { place, dice, resource, amount });
}
