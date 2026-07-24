import { GameError } from '../core';
import type { Card, StPetersburgState } from '../core';
import { nextSeatIndex, placeInPlayArea, record, seatOf, validateDisplacement, withPlayer } from '../internal';
import { displacementCost, handCost } from './buy';

/**
 * Play one card from the active player's hand into their play area (pg. 3, "play from his hand": "The
 * player places 1 card from his hand face up in his play area. He now pays the cost of the card…").
 *
 * The cost is charged with the standard reductions **except the lower-row discount** — a hand card is in
 * no row — floored at 1 ruble (`handCost`). Playable in **any phase**, any round after it was added (pg.
 * 3 Remember: "A player can play any card in his hand in any phase"; pg. 3: "a card he has added … earlier
 * in this round or from a previous round"). The card leaves the hand (hand compacts) and joins its kind's
 * play-area group.
 *
 * A **trading** card needs *displacement* of a same-colour card you own (pg. 7): pass its instance id as
 * `displace`. The cost is the difference-or-1 (`displacementCost`, no lower-row discount — a hand card is
 * in no row) and the displaced card goes to the discard. A trading card with no target is
 * `DISPLACE_REQUIRED`; a non-trading card carrying one is `DISPLACE_NOT_ALLOWED`. (`addToHand` allows
 * trading cards *into* hand; this is where they finally get *played*.)
 *
 * Like every action it resets the consecutive-pass counter and passes the turn on. It does **not** set
 * `tookCardThisPhase` — the card came from the hand, not the board, so it triggers no board refill.
 */
export function playFromHand(
  state: StPetersburgState,
  playerId: string,
  index: number,
  displace?: string,
): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const card = player.hand[index];
  if (!card) {
    throw new GameError('INVALID_CARD_SLOT', `No card at hand position ${index}`);
  }

  let displaced: Card | undefined;
  let cost: number;
  if (card.kind === 'trading') {
    if (displace === undefined) {
      throw new GameError(
        'DISPLACE_REQUIRED',
        `${card.name} is a trading card — name a card of yours to displace (pg. 7)`,
      );
    }
    displaced = validateDisplacement(player, card, displace, state.observatoryUsed);
    cost = displacementCost(player, card, displaced, undefined);
  } else {
    if (displace !== undefined) {
      throw new GameError('DISPLACE_NOT_ALLOWED', `${card.name} is not a trading card — it displaces nothing (pg. 7)`);
    }
    cost = handCost(player, card);
  }

  if (player.rubles < cost) {
    throw new GameError('INSUFFICIENT_RUBLES', `${card.name} costs ${cost} ruble(s); you have ${player.rubles}`);
  }

  const { playArea, discarded } = placeInPlayArea(player.playArea, card, displaced);
  const newHand = [...player.hand.slice(0, index), ...player.hand.slice(index + 1)];
  const updated = { ...player, rubles: player.rubles - cost, playArea, hand: newHand };

  const after: StPetersburgState = {
    ...state,
    players: withPlayer(state, seat, updated),
    board: discarded ? { ...state.board, discard: state.board.discard + discarded } : state.board,
  };
  return record(
    after,
    'PLAY_FROM_HAND',
    playerId,
    { consecutivePasses: 0, activePlayerIndex: nextSeatIndex(after) },
    {
      cardKey: card.key,
      cardName: card.name,
      cost,
      ...(displaced ? { displacedKey: displaced.key, displacedName: displaced.name } : {}),
    },
  );
}
