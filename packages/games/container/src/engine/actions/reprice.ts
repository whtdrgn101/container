import { FACTORY_LOT_PRICES, GameError, HARBOR_LOT_PRICES } from '../core';
import type { District, GameState, PlayerState, StoredContainer } from '../core';
import { assertValidLots, colorsOf, isSubMultiset, record, seatOf, withPlayer } from '../internal';

/**
 * Reprice action (rulebook pg. 10): rearrange the containers in one district into new lots. The
 * arrangement must contain exactly the same containers (by color) already there — you cannot add or
 * remove, only re-price — and every lot price must be valid for that district.
 */
export function reprice(
  state: GameState,
  playerId: string,
  district: District,
  arrangement: readonly StoredContainer[],
): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const current = district === 'factory' ? player.factoryStore : player.harborStore;
  const validPrices = district === 'factory' ? FACTORY_LOT_PRICES : HARBOR_LOT_PRICES;

  assertValidLots(arrangement, validPrices);

  const before = colorsOf(current);
  const after = colorsOf(arrangement);
  if (after.length !== before.length || !isSubMultiset(after, before)) {
    throw new GameError('INVALID_SELECTION', 'Reprice must keep exactly the same containers in the district');
  }

  const updated: PlayerState =
    district === 'factory'
      ? { ...player, factoryStore: [...arrangement] }
      : { ...player, harborStore: [...arrangement] };

  return record(state, withPlayer(state, seat, updated), 'REPRICE', playerId, {}, { district });
}
