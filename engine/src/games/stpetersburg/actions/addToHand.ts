import { GameError, handLimit } from '../core';
import type { StPetersburgState } from '../core';
import { nextSeatIndex, record, seatOf, withPlayer } from '../internal';

/** Which board row a card is taken from (pg. 3: "from either card row"). */
type Row = 'upper' | 'lower';

/**
 * Add one card from a board row into the active player's hidden hand — **free** (pg. 3, "add to his hand":
 * "The player takes 1 card from either card row and adds it to his hand. He does not pay for this card. A
 * player can have at most 3 cards in his hand…").
 *
 * The card leaves its row slot (rows **compact**, exactly like `buy`) and joins the player's hand, up to
 * `handLimit(player)` cards (3 at SP3; the Warehouse raises it to 4 at SP5). Over the limit throws
 * `HAND_FULL`.
 *
 * **Any card is hand-eligible — trading cards included.** Unlike `buy` (pg. 3: "1 worker or 1 building or
 * 1 aristocrat"), add-to-hand is worded "**1 card** from either card row", the Remember bullet reads "add
 * to his hand **any** of the cards on the board", and the Observatory (pg. 8) lets a drawn card of any
 * group be "add[ed] to his hand". So a trading card may be *held*; it just can't be *played* until
 * displacement exists (SP4) — see `playFromHand`. This ruling is documented on the module (`index.ts`).
 *
 * Like a buy, an add is an action: it **sets `tookCardThisPhase`** (a card left the board — the pg. 8
 * refill runs, and pg. 8's own "no cards … added to players' hands" special case keys off exactly this),
 * resets the consecutive-pass counter, and passes the turn on.
 *
 * The log **names** the taken card (`cardName`): on the physical table everyone SEES which card you take
 * from the open rows, so the take is public *at the moment it happens* — the hand is secret only as a
 * *set* afterward. (Nothing hidden is logged; see the log-visibility note on the module.)
 */
export function addToHand(state: StPetersburgState, playerId: string, row: Row, index: number): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const rowCards = state.board[row];
  const card = rowCards[index];
  if (!card) {
    throw new GameError('INVALID_CARD_SLOT', `No card at ${row}-row position ${index}`);
  }
  if (player.hand.length >= handLimit(player)) {
    throw new GameError('HAND_FULL', `Your hand is full (limit ${handLimit(player)} cards)`);
  }

  const updated = { ...player, hand: [...player.hand, card] };
  const newRow = [...rowCards.slice(0, index), ...rowCards.slice(index + 1)];

  const after: StPetersburgState = {
    ...state,
    players: withPlayer(state, seat, updated),
    board: { ...state.board, [row]: newRow },
  };
  // A card left the board this phase → the pg. 8 refill for this phase runs (not skipped).
  return record(after, 'ADD_TO_HAND', playerId, { consecutivePasses: 0, tookCardThisPhase: true, activePlayerIndex: nextSeatIndex(after) }, {
    cardKey: card.key,
    cardName: card.name,
    row,
  });
}
