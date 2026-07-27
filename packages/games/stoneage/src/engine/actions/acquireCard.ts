import { GameError, RESOURCES } from '../core';
import type { StoneAgePlayer, StoneAgeState } from '../core';
import {
  advanceActor,
  applyCardEffect,
  cardPaymentError,
  cardPlaceId,
  record,
  seatOf,
  totalPaid,
  withPlayer,
} from '../internal';
import type { Payment } from '../internal';

/**
 * Acquire the civilization card your person is standing on (rulebook pg. 6). Pay the slot's cost —
 * `resources` of any kinds (never food) totalling its position price — take the card (its **immediate
 * effect** applies at once, and it's kept for final scoring), and empty the slot. An **empty payment
 * means "decline"**: take your person back and leave the card. Either way the person returns and the
 * turn advances.
 */
export function acquireCard(state: StoneAgeState, playerId: string, slot: number, payment: Payment): StoneAgeState {
  const card = state.cardDisplay[slot] ?? null;
  const placeId = cardPlaceId(slot);
  if (card === null || state.placements[placeId]?.[playerId] === undefined) {
    throw new GameError('INVALID_CARD', `Player "${playerId}" has no person on a takeable card slot ${slot}`);
  }

  // Seat from `playerId`, not `activePlayerIndex` — see `feed` for why (this is a public export).
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  let players = state.players;
  let cardDisplay = state.cardDisplay;
  let payload: Record<string, unknown>;

  if (totalPaid(payment) === 0) {
    // Decline: leave the card, just take the person back.
    payload = { slot, declined: true };
  } else {
    const problem = cardPaymentError(slot, payment, player);
    if (problem) throw new GameError('INVALID_CARD', problem);

    const resources = { ...player.resources };
    for (const r of RESOURCES) resources[r] -= payment[r] ?? 0;
    const paid: StoneAgePlayer = { ...player, resources, civCards: [...player.civCards, card.id] };
    players = withPlayer(state, seat, applyCardEffect(paid, card)); // the immediate effect
    cardDisplay = state.cardDisplay.map((c, i) => (i === slot ? null : c)); // empty the slot
    payload = { slot, card: card.id };
  }

  // Return the person from the card slot.
  const { [playerId]: _removed, ...restOfSlot } = state.placements[placeId];
  const placements = { ...state.placements, [placeId]: restOfSlot };

  const after: StoneAgeState = { ...state, players, cardDisplay, placements };
  return record(after, 'ACQUIRE_CARD', playerId, advanceActor(after), payload);
}
