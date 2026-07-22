import { GameError } from '../core';
import type { PlayArea, StPetersburgState } from '../core';
import { nextSeatIndex, record, seatOf, withPlayer } from '../internal';
import { handCost } from './buy';

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
 * **Trading cards can't be played yet (SP4 seam).** Playing a trading card needs *displacement* of a
 * same-colour card you own (pg. 7), which isn't built, so a trading card in hand is **refused** with
 * `TRADING_NOT_BUYABLE`. This can't wedge the game: passing is always legal, and SP6's −5-per-hand-card
 * simply scores the stuck card. (`addToHand` deliberately allows trading cards *into* hand; this is the
 * matching seam that keeps them from being *played* until SP4.)
 *
 * Like every action it resets the consecutive-pass counter and passes the turn on. It does **not** set
 * `tookCardThisPhase` — the card came from the hand, not the board, so it triggers no board refill.
 */
export function playFromHand(state: StPetersburgState, playerId: string, index: number): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const card = player.hand[index];
  if (!card) {
    throw new GameError('INVALID_CARD_SLOT', `No card at hand position ${index}`);
  }
  if (card.kind === 'trading') {
    throw new GameError(
      'TRADING_NOT_BUYABLE',
      `${card.name} is a trading card — playing it needs displacement of a card you own (roadmap SP4)`,
    );
  }

  const cost = handCost(player, card);
  if (player.rubles < cost) {
    throw new GameError('INSUFFICIENT_RUBLES', `${card.name} costs ${cost} ruble(s); you have ${player.rubles}`);
  }

  // `card.kind` is narrowed to a play-area group by the trading guard above.
  const group = card.kind;
  const playArea = { ...player.playArea, [group]: [...player.playArea[group], card] } as PlayArea;
  const newHand = [...player.hand.slice(0, index), ...player.hand.slice(index + 1)];
  const updated = { ...player, rubles: player.rubles - cost, playArea, hand: newHand };

  const after: StPetersburgState = { ...state, players: withPlayer(state, seat, updated) };
  return record(after, 'PLAY_FROM_HAND', playerId, { consecutivePasses: 0, activePlayerIndex: nextSeatIndex(after) }, {
    cardKey: card.key,
    cardName: card.name,
    cost,
  });
}
