/**
 * Everything a player can do in Saint Petersburg.
 *
 * The four actions (pg. 2–3): `BUY` a card (into the play area, paying) / `ADD_TO_HAND` (into the hidden
 * hand, free) / `PLAY_FROM_HAND` (a held card into the play area, paying) / `PASS`. **SP1** shipped the
 * phase spine (`BUY` + `PASS`); **SP3** adds the hidden hand (`ADD_TO_HAND` + `PLAY_FROM_HAND`). The
 * trading-card *buys/plays* that need displacement arrive in SP4.
 *
 * `row` names which of the two board rows a card is taken from; `index` is its position in that (compacted)
 * row for `BUY`/`ADD_TO_HAND`, or in the player's own hand for `PLAY_FROM_HAND` — a taken card is spliced
 * out, so indices shift, and a stale index throws `INVALID_CARD_SLOT`.
 */
export type Action =
  | { readonly type: 'BUY'; readonly row: 'upper' | 'lower'; readonly index: number }
  | { readonly type: 'ADD_TO_HAND'; readonly row: 'upper' | 'lower'; readonly index: number }
  | { readonly type: 'PLAY_FROM_HAND'; readonly index: number }
  | { readonly type: 'PASS' };

export type ActionType = Action['type'];
