import { GameError, MIN_CARD_COST } from '../core';
import type { Card, PlayArea, StPetersburgState } from '../core';
import { groupOf, nextSeatIndex, placeInPlayArea, record, seatOf, validateDisplacement, withPlayer } from '../internal';

/** Which board row a card is bought from — the `-1 ruble` lower row, or the upper row (pg. 6). */
type Row = 'upper' | 'lower';

/**
 * The cost reductions on `card` that apply **wherever it is played from** — everything *except* the
 * lower-row discount (pg. 6 — "All cost reductions are cumulative"):
 *
 *  - **−1 per same-named card** already in the play area. "Same name" is the same `key`; a key only ever
 *    appears in the group matching its kind, so scanning all three groups is equivalent and kind-agnostic.
 *  - **−1 per owned carpenter workshop** when buying/playing a **blue** (building) card, and **−1 per owned
 *    gold smelter** when buying/playing an **orange** (aristocrat) card (pg. 7–8 sheet — "reduces the
 *    owner's cost by 1 ruble whenever the player buys a blue/orange card, **including upgrades**"). "Colour"
 *    is the card's group (`groupOf`), so it fires for both a plain building/aristocrat and a
 *    building/aristocrat *trading* card. Cumulative with everything, floored at 1 ruble.
 *
 * Split out from `costReductions` so `PLAY_FROM_HAND` reuses it (SP3): a hand card is in **no row**, so it
 * gets these reductions but not the lower-row −1. `costReductions` = these + the row discount.
 */
export function baseReductions(player: { readonly playArea: PlayArea }, card: Card): number {
  const owned = [...player.playArea.worker, ...player.playArea.building, ...player.playArea.aristocrat];
  // −1 per same-named card already owned (pg. 6).
  let reductions = owned.filter((c) => c.key === card.key).length;
  // Owned-card reductions (pg. 7–8): carpenter workshop → blue cards; gold smelter → orange cards.
  const color = groupOf(card);
  if (color === 'building') reductions += owned.filter((c) => c.key === 'carpenterWorkshop').length;
  if (color === 'aristocrat') reductions += owned.filter((c) => c.key === 'goldSmelter').length;
  return reductions;
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
 * What a **trading** `card` costs this player when it displaces `target` (pg. 7): the printed cost minus the
 * displaced card's printed cost **when the trading card is dearer**, else **1 ruble** — then all the normal
 * reductions apply (`baseReductions`, plus the lower-row −1 for a buy), floored at 1 ruble. `fromRow` is the
 * board row for a `BUY`, or `undefined` for a hand play (no lower-row discount). Pure, so the UI can show
 * the effective price and `legalActions` can test affordability with the same rule the buy charges.
 *
 * Worked examples (pg. 7–8): wharf 12−7 = 5; St Isaac's 15−5 = 10, then −1 (lower row) −1 (carpenter
 * workshop) = 8; the senator (cheaper than the aristocrat it displaces) = 1.
 */
export function displacementCost(
  player: { readonly playArea: PlayArea },
  card: Card,
  target: Card,
  fromRow?: Row,
): number {
  const difference = card.cost > target.cost ? card.cost - target.cost : MIN_CARD_COST;
  const reductions = baseReductions(player, card) + (fromRow === 'lower' ? 1 : 0);
  return afterReductions(difference, reductions);
}

/**
 * Buy one card from a board row into the active player's play area (pg. 3, 6, 7).
 *
 * The card leaves its row slot (rows **compact** — a bought card is spliced out, so a row is always a
 * dense list and `index` is a position in the current row, not a fixed slot; the rulebook's "slide the
 * remaining cards right" is physical bookkeeping the engine needn't model). A buy is an action, so it
 * **resets the consecutive-pass counter** and passes the turn on (pg. 3).
 *
 * A **trading** card (pg. 7) must displace an already-placed card of the same colour you own (`displace` =
 * its instance id): the displaced card goes to the discard, the cost is the difference-or-1
 * (`displacementCost`), and the trading card joins the group it upgrades. A trading card with no target is
 * `DISPLACE_REQUIRED`; a non-trading card carrying one is `DISPLACE_NOT_ALLOWED`.
 */
export function buy(
  state: StPetersburgState,
  playerId: string,
  row: Row,
  index: number,
  displace?: string,
): StPetersburgState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  const rowCards = state.board[row];
  const card = rowCards[index];
  if (!card) {
    throw new GameError('INVALID_CARD_SLOT', `No card at ${row}-row position ${index}`);
  }

  let displaced: Card | undefined;
  let cost: number;
  if (card.kind === 'trading') {
    if (displace === undefined) {
      throw new GameError('DISPLACE_REQUIRED', `${card.name} is a trading card — name a card of yours to displace (pg. 7)`);
    }
    displaced = validateDisplacement(player, card, displace);
    cost = displacementCost(player, card, displaced, row);
  } else {
    if (displace !== undefined) {
      throw new GameError('DISPLACE_NOT_ALLOWED', `${card.name} is not a trading card — it displaces nothing (pg. 7)`);
    }
    cost = effectiveCost(player, card, row);
  }

  if (player.rubles < cost) {
    throw new GameError('INSUFFICIENT_RUBLES', `${card.name} costs ${cost} ruble(s); you have ${player.rubles}`);
  }

  const { playArea, discarded } = placeInPlayArea(player.playArea, card, displaced);
  const updated = { ...player, rubles: player.rubles - cost, playArea };
  const newRow = [...rowCards.slice(0, index), ...rowCards.slice(index + 1)];

  const after: StPetersburgState = {
    ...state,
    players: withPlayer(state, seat, updated),
    board: { ...state.board, [row]: newRow, discard: state.board.discard + discarded },
  };
  // A card left the board this phase → the pg. 8 refill for this phase will run (not be skipped).
  return record(after, 'BUY', playerId, { consecutivePasses: 0, tookCardThisPhase: true, activePlayerIndex: nextSeatIndex(after) }, {
    cardKey: card.key,
    cardName: card.name,
    cost,
    row,
    ...(displaced ? { displacedKey: displaced.key, displacedName: displaced.name } : {}),
  });
}
