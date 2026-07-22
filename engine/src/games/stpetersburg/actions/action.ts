/**
 * Everything a player can do in Saint Petersburg.
 *
 * The action loop is `BUY` a card / `ADD_TO_HAND` / `PLAY_FROM_HAND` / `PASS` (pg. 2–3). **SP1 implements
 * the phase spine — `BUY` and `PASS`** (see `applyAction`); `ADD_TO_HAND`/`PLAY_FROM_HAND` and the
 * trading-card buys (which need displacement) arrive with their own slices (SP3–SP4).
 *
 * `row` names which of the two board rows a card is taken from; `index` is its position in that (compacted)
 * row — a bought card is spliced out, so indices shift, and a stale index throws `INVALID_CARD_SLOT`.
 */
export type Action =
  | { readonly type: 'BUY'; readonly row: 'upper' | 'lower'; readonly index: number }
  | { readonly type: 'PASS' };

export type ActionType = Action['type'];
