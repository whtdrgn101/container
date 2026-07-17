import { DIE_FACES, GameError, HUNT_THRESHOLD, PLACE_RESOURCE, RESOURCE_THRESHOLD } from '../core';
import type { PlaceId, StoneAgePlayer, StoneAgeState } from '../core';
import { advanceActor, isGatherPlace, record, withPlayer } from '../internal';

/**
 * Resolve a dice place (rulebook pg. 6): roll one die per person, sum them, and take 1 yield per "full
 * N". The **hunt** pays food (per full 2); the four **resource** places pay their resource (wood per 3,
 * brick per 4, stone per 5, gold per 6). Same engine, different threshold and yield — the dice are
 * injected, so the engine stays pure. The people are returned and the turn advances.
 *
 * *(Tools, which add to the total, arrive with SA4 — you can't own any yet.)*
 */
export function gather(state: StoneAgeState, playerId: string, place: PlaceId, dice: readonly number[]): StoneAgeState {
  if (!isGatherPlace(place) || state.placements[place][playerId] === undefined) {
    throw new GameError('INVALID_GATHER', `Player "${playerId}" has no people to gather at "${place}"`);
  }
  const people = state.placements[place][playerId]!;
  const valid = dice.length === people && dice.every((d) => Number.isInteger(d) && d >= 1 && d <= DIE_FACES);
  if (!valid) {
    throw new GameError('INVALID_GATHER', `A gather at "${place}" needs ${people} dice of 1–${DIE_FACES}`);
  }

  const total = dice.reduce((sum, d) => sum + d, 0);
  const seat = state.activePlayerIndex;
  const player = state.players[seat]!;

  // The hunt yields food; every other gather place yields its resource.
  let updated: StoneAgePlayer;
  let kind: string;
  let amount: number;
  if (place === 'hunt') {
    amount = Math.floor(total / HUNT_THRESHOLD);
    kind = 'food';
    updated = { ...player, food: player.food + amount };
  } else {
    const resource = PLACE_RESOURCE[place];
    amount = Math.floor(total / RESOURCE_THRESHOLD[resource]);
    kind = resource;
    updated = { ...player, resources: { ...player.resources, [resource]: player.resources[resource] + amount } };
  }

  const players = withPlayer(state, seat, updated);
  // Return this group's people by removing the placement.
  const { [playerId]: _removed, ...restOfPlace } = state.placements[place];
  const placements = { ...state.placements, [place]: restOfPlace };

  const afterGather: StoneAgeState = { ...state, players, placements };
  return record(afterGather, 'GATHER', playerId, advanceActor(afterGather), { place, dice, amount, kind });
}
