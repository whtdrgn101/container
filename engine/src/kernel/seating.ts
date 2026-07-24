/** The minimal seated-game shape the shared seat helpers read. */
export interface SeatedState<P extends { readonly id: string }> {
  readonly players: readonly P[];
  readonly activePlayerIndex: number;
}

/** A game's seat helpers, bound to its own player type. */
export interface SeatHelpers<P extends { readonly id: string }> {
  /** The seat index of `playerId`, or throw (via the game's `onMissing`) if no such player. */
  seatOf(state: SeatedState<P>, playerId: string): number;
  /** A new roster with `seat` replaced by `player` (immutable). */
  withPlayer(state: SeatedState<P>, seat: number, player: P): readonly P[];
  /** The player whose turn it is. */
  activePlayer(state: SeatedState<P>): P;
}

/**
 * Build a game's seat helpers. State shapes and `record()` payloads differ per game, but *seating* is
 * identical across all three — locate a seat, replace a seat, read the active seat over a `players`
 * array — so it is shared here (it was three byte-identical copies; see REVIEW.md §3.2).
 *
 * ⚠️ `onMissing` throws the **game's own** `GameError` subclass, not the kernel base — and that is the
 * whole reason this is a factory rather than three free functions. The backend's `mapError` does
 * `error instanceof <that game's> GameError` to turn PLAYER_NOT_FOUND into a 404. A kernel helper
 * throwing the *base* `GameError` would be `instanceof` none of the subclasses, so `mapError` would
 * return `null` and the 404 would silently become a 500. Injecting the thrower keeps the exact subclass
 * each game already threw — no backend change, byte-identical behaviour.
 */
export function makeSeating<P extends { readonly id: string }>(onMissing: (playerId: string) => never): SeatHelpers<P> {
  return {
    seatOf(state, playerId) {
      const index = state.players.findIndex((player) => player.id === playerId);
      if (index === -1) onMissing(playerId);
      return index;
    },
    withPlayer(state, seat, player) {
      return state.players.map((current, index) => (index === seat ? player : current));
    },
    activePlayer(state) {
      return state.players[state.activePlayerIndex]!;
    },
  };
}
