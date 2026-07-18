import { GameError, RESOURCES } from '../core';
import type { StoneAgePlayer, StoneAgeState } from '../core';
import {
  advanceActor,
  buildingPaymentError,
  buildingPlaceId,
  paymentValue,
  record,
  totalPaid,
  withPlayer,
} from '../internal';
import type { Payment } from '../internal';

/**
 * Buy the building your person is standing on (rulebook pg. 7). Pay the tile's resources to the supply,
 * score their combined value immediately onto the track, take the building, and reveal the next tile on
 * that stack. An **empty payment means "decline"** — you take your person back and leave the building
 * (pg. 7: "if the player cannot or does not want to pay… he takes back his people figure"). Either way
 * the person is returned and the turn advances.
 */
export function build(state: StoneAgeState, playerId: string, stack: number, payment: Payment): StoneAgeState {
  const building = state.buildings[stack]?.[0]; // the revealed top the person was placed on
  const placeId = buildingPlaceId(stack);
  if (building === undefined || state.placements[placeId]?.[playerId] === undefined) {
    throw new GameError('INVALID_BUILD', `Player "${playerId}" has no person on a buildable stack ${stack}`);
  }

  const seat = state.activePlayerIndex;
  const player = state.players[seat]!;

  let players = state.players;
  let buildings = state.buildings;
  let payload: Record<string, unknown>;

  if (totalPaid(payment) === 0) {
    // Decline: leave the building, just take the person back.
    payload = { stack, declined: true };
  } else {
    const problem = buildingPaymentError(building, payment, player);
    if (problem) throw new GameError('INVALID_BUILD', problem);

    const points = paymentValue(payment);
    const resources = { ...player.resources };
    for (const r of RESOURCES) resources[r] -= payment[r] ?? 0;
    const updated: StoneAgePlayer = {
      ...player,
      resources,
      score: player.score + points,
      buildings: player.buildings + 1,
    };
    players = withPlayer(state, seat, updated);
    buildings = state.buildings.map((tiles, i) => (i === stack ? tiles.slice(1) : tiles)); // reveal next
    payload = { stack, building: building.id, points };
  }

  // Return the person from the building slot.
  const { [playerId]: _removed, ...restOfSlot } = state.placements[placeId];
  const placements = { ...state.placements, [placeId]: restOfSlot };

  const after: StoneAgeState = { ...state, players, buildings, placements };
  return record(after, 'BUILD', playerId, advanceActor(after), payload);
}
