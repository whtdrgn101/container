/**
 * Everything a player can do in Saint Petersburg.
 *
 * The four actions (pg. 2–3): `BUY` a card (into the play area, paying) / `ADD_TO_HAND` (into the hidden
 * hand, free) / `PLAY_FROM_HAND` (a held card into the play area, paying) / `PASS`. **SP1** shipped the
 * phase spine (`BUY` + `PASS`); **SP3** adds the hidden hand (`ADD_TO_HAND` + `PLAY_FROM_HAND`); **SP4**
 * makes the trading cards buyable/playable via displacement.
 *
 * `row` names which of the two board rows a card is taken from; `index` is its position in that (compacted)
 * row for `BUY`/`ADD_TO_HAND`, or in the player's own hand for `PLAY_FROM_HAND` — a taken card is spliced
 * out, so indices shift, and a stale index throws `INVALID_CARD_SLOT`.
 *
 * `displace` (SP4) is the **instance id** of an already-placed card to discard when buying/playing a
 * **trading** card (pg. 7). An id, not an index, so it is stable and self-validating: a stale/illegal id is
 * `INVALID_DISPLACE_TARGET`, a trading card without one is `DISPLACE_REQUIRED`, and a non-trading card
 * carrying one is `DISPLACE_NOT_ALLOWED`.
 *
 * **SP5 special cards (pg. 8):** `PUB_BUY` buys `points` (0–5) victory points at 2 rubles each during the
 * Pub interlude after building scoring (0 = decline). `OBSERVATORY_DRAW` draws the top of a chosen `stack`
 * (building phase, instead of a normal action), producing a forced follow-up; `OBSERVATORY_RESOLVE` then
 * buys / hands / discards the drawn card (`displace` when buying a trading card, as for `BUY`).
 */
export type Action =
  | { readonly type: 'BUY'; readonly row: 'upper' | 'lower'; readonly index: number; readonly displace?: string }
  | { readonly type: 'ADD_TO_HAND'; readonly row: 'upper' | 'lower'; readonly index: number }
  | { readonly type: 'PLAY_FROM_HAND'; readonly index: number; readonly displace?: string }
  | { readonly type: 'PASS' }
  | { readonly type: 'PUB_BUY'; readonly points: number }
  | { readonly type: 'OBSERVATORY_DRAW'; readonly stack: 'worker' | 'building' | 'aristocrat' | 'trading' }
  | { readonly type: 'OBSERVATORY_RESOLVE'; readonly choice: 'buy' | 'hand' | 'discard'; readonly displace?: string };

export type ActionType = Action['type'];
