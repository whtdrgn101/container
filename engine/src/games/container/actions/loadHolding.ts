import { GameError, SHIP_CAPACITY } from '../core';
import type { GameState, PlayerState } from '../core';
import { record, seatOf, withPlayer } from '../internal';

/**
 * Load containers from your Bank holding area onto your ship (rulebook pg. 11 anchor action). Your
 * ship must be docked at the Off-Shore Bank. Loads as many as will fit (up to SHIP_CAPACITY). Free.
 */
export function loadHolding(state: GameState, playerId: string): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (player.ship.location.kind !== 'bank') {
    throw new GameError('SHIP_NOT_AT_BANK', `Player "${playerId}"'s ship is not at the Off-Shore Bank`);
  }
  if (player.holdingArea.length === 0) {
    throw new GameError('NOTHING_IN_HOLDING', `Player "${playerId}" has nothing in their holding area`);
  }

  const room = SHIP_CAPACITY - player.ship.cargo.length;
  const loaded = player.holdingArea.slice(0, room);
  const updated: PlayerState = {
    ...player,
    ship: { ...player.ship, cargo: [...player.ship.cargo, ...loaded] },
    holdingArea: player.holdingArea.slice(room),
  };
  return record(state, withPlayer(state, seat, updated), 'LOAD_FROM_BANK', playerId, {}, { loaded: loaded.length });
}
