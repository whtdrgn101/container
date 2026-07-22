import { GameError, MIN_CARD_COST } from '../core';
import type { Card, PlayArea, StPetersburgState } from '../core';
import { nextSeatIndex, record, seatOf, withPlayer } from '../internal';

/** Which board row a card is bought from — the `-1 ruble` lower row, or the upper row (pg. 6). */
type Row = 'upper' | 'lower';

/**
 * The cost reductions on `card` that apply **wherever it is played from** — everything *except* the
 * lower-row discount (pg. 6 — "All cost reductions are cumulative"):
 *
 *  - **−1 per same-named card** already in the play area. "Same name" is the same `key`; a key only ever
 *    appears in the group matching its kind, so scanning all three groups is equivalent and kind-agnostic.
 *
 * Split out from `costReductions` so `PLAY_FROM_HAND` can reuse it (SP3): a hand card is in **no row**, so
 * it gets these reductions but not the lower-row −1. `costReductions` = these + the row discount.
 *
 * **SP4/SP5 seam:** a **gold smelter** (−1 per aristocrat bought after it) and a **carpenter workshop**
 * (−1 per building) also reduce cost cumulatively (pg. 6). Those are trading cards that can't be owned
 * until SP4/SP5, so there is nothing to count yet — the hook is this note; add their terms here when
 * those cards land (they reduce hand-plays too, so they belong in *this* base, not the row discount).
 */
export function baseReductions(player: { readonly playArea: PlayArea }, card: Card): number {
  const owned = [...player.playArea.worker, ...player.playArea.building, ...player.playArea.aristocrat];
  return owned.filter((c) => c.key === card.key).length;
}

/**
 * The full cumulative cost reduction on `card` bought from `row` (pg. 6): the row-independent
 * `baseReductions` **plus −1 when bought from the lower card row**.
 */
export function costReductions(player: { readonly playArea: PlayArea }, card: Card, row: Row): number {
  return baseReductions(player, card) + (row === 'lower' ? 1 : 0);
}

/**
 * Apply the **min-1-ruble floor** to a printed cost after `reductions` (pg. 6: "must always pay at least 1
 * ruble, even when its cost is 0 or less"). The single home for that rule, shared by the row-buy price
 * (`effectiveCost`) and the hand-play price (`handCost`).
 */
function afterReductions(printedCost: number, reductions: number): number {
  return Math.max(MIN_CARD_COST, printedCost - reductions);
}

/**
 * What `card` costs this player bought from `row` — the printed cost minus cumulative reductions, floored
 * at 1 ruble. Pure and side-effect-free, so the UI can show the effective price with the printed one
 * struck through, and `legalActions` can test affordability with the same rule the buy charges.
 */
export function effectiveCost(player: { readonly playArea: PlayArea }, card: Card, row: Row): number {
  return afterReductions(card.cost, costReductions(player, card, row));
}

/**
 * What `card` costs this player to **play from hand** (pg. 3 "play from his hand": "he now pays the cost
 * of the card") — the printed cost minus the **row-independent** reductions (`baseReductions`), floored at
 * 1 ruble. **No lower-row discount** — a hand card isn't in a row. Shared by `playFromHand` and the UI.
 */
export function handCost(player: { readonly playArea: PlayArea }, card: Card): number {
  return afterReductions(card.cost, baseReductions(player, card));
}

/**
 * Buy one card from a board row into the active player's play area (pg. 3, 6).
 *
 * The card leaves its row slot (rows **compact** — a bought card is spliced out, so a row is always a
 * dense list and `index` is a position in the current row, not a fixed slot; the rulebook's "slide the
 * remaining cards right" is physical bookkeeping the engine needn't model). The player pays the effective
 * cost, and the card joins its kind's group. A buy is an action, so it **resets the consecutive-pass
 * counter** and passes the turn on (pg. 3). Trading cards can't be bought yet (SP4 seam).
 */
export function buy(state: StPetersburgState, playerId: string, row: Row, index: number): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const rowCards = state.board[row];
  const card = rowCards[index];
  if (!card) {
    throw new GameError('INVALID_CARD_SLOT', `No card at ${row}-row position ${index}`);
  }
  if (card.kind === 'trading') {
    throw new GameError(
      'TRADING_NOT_BUYABLE',
      `${card.name} is a trading card — buying it needs displacement of a card you own (roadmap SP4)`,
    );
  }

  const cost = effectiveCost(player, card, row);
  if (player.rubles < cost) {
    throw new GameError('INSUFFICIENT_RUBLES', `${card.name} costs ${cost} ruble(s); you have ${player.rubles}`);
  }

  // `card.kind` is narrowed to a play-area group by the trading guard above.
  const group = card.kind;
  const playArea = { ...player.playArea, [group]: [...player.playArea[group], card] } as PlayArea;
  const updated = { ...player, rubles: player.rubles - cost, playArea };
  const newRow = [...rowCards.slice(0, index), ...rowCards.slice(index + 1)];

  const after: StPetersburgState = {
    ...state,
    players: withPlayer(state, seat, updated),
    board: { ...state.board, [row]: newRow },
  };
  // A card left the board this phase → the pg. 8 refill for this phase will run (not be skipped).
  return record(after, 'BUY', playerId, { consecutivePasses: 0, tookCardThisPhase: true, activePlayerIndex: nextSeatIndex(after) }, {
    cardKey: card.key,
    cardName: card.name,
    cost,
    row,
  });
}
