/**
 * Everything that can happen in a Can't Stop turn. `applyAction` is the turn-aware entry point.
 *
 * `ROLL` is **server-only**: it carries the four dice, which a trusted caller rolls with injected
 * randomness (the backend's roll route). It is never accepted from a client — `parseAction` refuses
 * it and `legalActions` never offers it — so no player can choose their own dice. `SELECT` and `STOP`
 * are the player's real choices.
 */
export type Action =
  | { readonly type: 'ROLL'; readonly dice: readonly [number, number, number, number] }
  | { readonly type: 'SELECT'; readonly columns: readonly number[] }
  | { readonly type: 'STOP' };

export type ActionType = Action['type'];
