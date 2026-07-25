import { GameError, IDEA_CARD_COINS, IDEA_CARD_LOCO, IDEA_CARDS } from '../core';
import type { IdeaCardId, RussianRailroadsState } from '../core';
import { continueTurn, hiringEngineer, legalSteps, record, seatOf, takeHiring, withPlayer } from '../internal';

/**
 * `RESOLVE_IDEA_CARD` — choose one idea card (pg. 46–47, RR6), granted when the end-bonus idea token is
 * resolved. The lock's presence + turn checks are in `applyAction`. The five cards (three read off pg. 47,
 * two ADAPTED — see `ideas.ts`):
 *
 *  - `wood-worker`   — an extra permanent worker + a passive wood-move bonus (pg. 47);
 *  - `loco-9`        — take a #9 locomotive and place it now (opens the loco lock, pg. 47);
 *  - `engineer-coin` — a coin **and** a free hiring-space engineer (RR7 wired the engineer half);
 *  - `extra-coins`   — 2 coins (ADAPTED);
 *  - `wood-move`     — advance a wood track 1 space (ADAPTED; opens the moves lock, or forfeits if blocked).
 *
 * Never mutates; throws typed.
 */
export function resolveIdeaCard(
  state: RussianRailroadsState,
  playerId: string,
  card: IdeaCardId,
): RussianRailroadsState {
  if (!IDEA_CARDS.includes(card)) throw new GameError('UNKNOWN_IDEA_CARD', `No idea card "${card}"`);
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  if (card === 'loco-9') {
    // Take the #9 from the card (not the supply) and place it — the loco lock holds the turn (pg. 47).
    return record(
      state,
      'RESOLVE_IDEA_CARD',
      playerId,
      { pendingIdeaCard: null, pendingLoco: { number: IDEA_CARD_LOCO } },
      { card },
    );
  }

  if (card === 'wood-move') {
    // A single wood-track step (ADAPTED): open the moves lock if a wood step is possible, else forfeit it.
    if (legalSteps(player.routes, ['wood']).length > 0) {
      return record(
        state,
        'RESOLVE_IDEA_CARD',
        playerId,
        { pendingIdeaCard: null, pendingMoves: { remaining: 1, colors: ['wood'] } },
        { card },
      );
    }
    return record(
      state,
      'RESOLVE_IDEA_CARD',
      playerId,
      { pendingIdeaCard: null, ...continueTurn(state, seat) },
      { card },
    );
  }

  // The `engineer-coin` card (pg. 47, RR7 wires the engineer half): a coin **and** a free engineer. Take the
  // hiring-space engineer (no coin cost, unlike a normal `HIRE_ENGINEER`) if one is available, emptying that
  // strip slot; the coin is granted regardless. Documented ADAPTED read (pg. 47 legibility) — reconcile RR9.
  if (card === 'engineer-coin') {
    const engineer = hiringEngineer(state.engineerStrip);
    const updated = {
      ...player,
      coins: player.coins + IDEA_CARD_COINS[card]!,
      hiredEngineers: engineer ? [...player.hiredEngineers, engineer] : player.hiredEngineers,
    };
    const next = { ...state, players: withPlayer(state, seat, updated), pendingIdeaCard: null };
    return record(
      state,
      'RESOLVE_IDEA_CARD',
      playerId,
      {
        pendingIdeaCard: null,
        ...(engineer ? { engineerStrip: takeHiring(state.engineerStrip) } : {}),
        ...continueTurn(next, seat),
      },
      { card, ...(engineer ? { engineerId: engineer.id } : {}) },
    );
  }

  // The resource cards resolve immediately, then hand off.
  let updated = player;
  if (card === 'wood-worker') {
    updated = {
      ...player,
      woodWorker: true,
      workersTotal: player.workersTotal + 1,
      workersAvailable: player.workersAvailable + 1,
    };
  } else {
    updated = { ...player, coins: player.coins + IDEA_CARD_COINS[card]! };
  }
  const next = { ...state, players: withPlayer(state, seat, updated), pendingIdeaCard: null };
  return record(state, 'RESOLVE_IDEA_CARD', playerId, { pendingIdeaCard: null, ...continueTurn(next, seat) }, { card });
}
