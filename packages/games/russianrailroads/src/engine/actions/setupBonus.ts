import { GameError, STARTING_BONUS_CARDS } from '../core';
import type { RussianRailroadsState } from '../core';
import { advanceWrench, continueTurn, record, seatOf, withPlayer } from '../internal';

/**
 * `RESOLVE_SETUP_BONUS` — the game-start starting-bonus setup mini-phase (pg. 6, RR6). The head seat of
 * `pendingSetupBonus` (4th → 3rd → 2nd position; the start player takes none) picks and resolves one
 * starting bonus card's simple action. When the queue empties, round 1's placement opens (via
 * `continueTurn` → the setup-advance). The turn / queue checks are in `applyAction`.
 *
 * The four cards are ADAPTED simple actions (see `ideas.ts`): coins, a wood-track move, and/or a wrench
 * advance. **Simplification (documented):** each seat may pick any of the four (the physical cards are
 * shared / consumed; the ADAPTED model does not track that — a negligible difference for four small
 * bonuses, reconciled in RR9). Never mutates; throws typed.
 */
export function resolveSetupBonus(state: RussianRailroadsState, playerId: string, cardId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const card = STARTING_BONUS_CARDS.find((c) => c.id === cardId);
  if (!card) throw new GameError('UNKNOWN_SETUP_BONUS', `No starting bonus card "${cardId}"`);

  // Apply the immediate parts (coins + a wrench advance — no factories exist yet, so nothing triggers).
  let updated = player;
  if (card.coins) updated = { ...updated, coins: updated.coins + card.coins };
  if (card.industry) {
    const { wrench } = advanceWrench(updated.industry, card.industry);
    updated = { ...updated, industry: { ...updated.industry, wrench } };
  }

  // A wood-move card opens the moves lock (wood on space 1 can always advance at setup); the seat resolves
  // it, then `MOVE_TRACK`→`continueTurn` advances the setup queue.
  if (card.woodMoves) {
    return record(
      state,
      'RESOLVE_SETUP_BONUS',
      playerId,
      { players: withPlayer(state, seat, updated), pendingMoves: { remaining: card.woodMoves, colors: ['wood'] } },
      { card: cardId },
    );
  }
  const next = { ...state, players: withPlayer(state, seat, updated) };
  return record(state, 'RESOLVE_SETUP_BONUS', playerId, continueTurn(next, seat), { card: cardId });
}
