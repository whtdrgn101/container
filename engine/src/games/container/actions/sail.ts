import { GameError } from '../core';
import type { GameState, PlayerState, ShipLocation } from '../core';
import { record, seatOf, withPlayer } from '../internal';

/**
 * Sail action (rulebook pg. 11). One Sail moves the ship one "hop":
 *  - from the **ocean** → to an opponent's harbor, Container Island, or the Off-Shore Bank;
 *  - from any of those → back to the **ocean**.
 *
 * You can't sail directly between two destinations (cross via the ocean — that's why crossing the
 * board costs 2 actions), and you can never enter your **own** harbor. Anchor effects (Harbor
 * Purchase / delivery auction / bank load) attach in later slices; this action is pure movement.
 */
export function sail(state: GameState, playerId: string, to: ShipLocation): GameState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const from = player.ship.location;

  if (from.kind === 'ocean') {
    if (to.kind === 'ocean') {
      throw new GameError('INVALID_DESTINATION', 'The ship is already in the ocean');
    }
    if (to.kind === 'harbor') {
      if (to.playerId === playerId) {
        throw new GameError('CANNOT_ENTER_OWN_HARBOR', 'A ship can never enter its own harbor');
      }
      seatOf(state, to.playerId); // validate the harbor's owner exists (throws PLAYER_NOT_FOUND)
    }
  } else if (to.kind !== 'ocean') {
    throw new GameError('INVALID_DESTINATION', 'The ship must return to the ocean before sailing on');
  }

  const updated: PlayerState = { ...player, ship: { ...player.ship, location: to } };
  return record(state, withPlayer(state, seat, updated), 'SAIL', playerId, {}, { to });
}
