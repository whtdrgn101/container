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
 */
export type Action =
  | { readonly type: 'BUY'; readonly row: 'upper' | 'lower'; readonly index: number; readonly displace?: string }
  | { readonly type: 'ADD_TO_HAND'; readonly row: 'upper' | 'lower'; readonly index: number }
  | { readonly type: 'PLAY_FROM_HAND'; readonly index: number; readonly displace?: string }
  | { readonly type: 'PASS' };

export type ActionType = Action['type'];
