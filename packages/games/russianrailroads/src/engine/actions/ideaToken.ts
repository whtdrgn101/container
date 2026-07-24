import { GameError, IDEA_TOKEN_TYPES, KEYS_FROM_TOKEN, SECOND_WRENCH_STEPS } from '../core';
import type { IdeaTokenType, RussianRailroadsState } from '../core';
import { advanceWrench, continueTurn, record, seatOf, withPlayer } from '../internal';

/**
 * `RESOLVE_IDEA_TOKEN` — spend one of your unused idea tokens at an idea-token space (pp. 18–19, 46, RR6).
 * The lock's presence + turn checks are in `applyAction`. Each type is single-use; the five benefits:
 *
 *  - `twenty-points` — place the 20-point medal (+20 each scoring phase);
 *  - `revaluation`   — flip the valuation tile to its better side;
 *  - `keys`          — receive 2 keys (opens the key choice, holding the turn);
 *  - `second-wrench` — place a second wrench + 2 industry steps (it then scores + moves too);
 *  - `end-bonus`     — draw the top end-bonus card (draw-top ruling) + choose one idea card (holds the turn).
 *
 * Never mutates; throws typed.
 */
export function resolveIdeaToken(
  state: RussianRailroadsState,
  playerId: string,
  token: IdeaTokenType,
): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (!IDEA_TOKEN_TYPES.includes(token) || player.usedIdeaTokens.includes(token)) {
    throw new GameError('IDEA_TOKEN_UNAVAILABLE', `Idea token "${token}" is unknown or already used`);
  }
  const used = { ...player, usedIdeaTokens: [...player.usedIdeaTokens, token] };

  if (token === 'twenty-points') {
    const next = { ...state, players: withPlayer(state, seat, { ...used, medal20: true }), pendingIdeaToken: null };
    return record(state, 'RESOLVE_IDEA_TOKEN', playerId, { pendingIdeaToken: null, ...continueTurn(next, seat) }, { token });
  }
  if (token === 'revaluation') {
    const next = { ...state, players: withPlayer(state, seat, { ...used, revalued: true }), pendingIdeaToken: null };
    return record(state, 'RESOLVE_IDEA_TOKEN', playerId, { pendingIdeaToken: null, ...continueTurn(next, seat) }, { token });
  }
  if (token === 'second-wrench') {
    // Place the second wrench on START, then advance it 2 steps (pg. 47). The first 2 steps never reach a
    // gap (GAP 1 is later on the lane), so no factory is re-triggered at placement.
    const wrench = advanceWrench({ ...player.industry, wrench: 0 }, SECOND_WRENCH_STEPS).wrench;
    const industry = { ...used.industry, secondWrench: wrench };
    const next = { ...state, players: withPlayer(state, seat, { ...used, industry }), pendingIdeaToken: null };
    return record(
      state,
      'RESOLVE_IDEA_TOKEN',
      playerId,
      { pendingIdeaToken: null, ...continueTurn(next, seat) },
      { token, secondWrench: wrench },
    );
  }
  if (token === 'keys') {
    // Receiving 2 keys owes a key choice each — the key lock holds the turn (pg. 19, 46). This token is only
    // reachable with no key already pending (the lock gate), so the count is exactly `KEYS_FROM_TOKEN`.
    const withKeys = { ...used, keysReceived: used.keysReceived + KEYS_FROM_TOKEN };
    return record(
      state,
      'RESOLVE_IDEA_TOKEN',
      playerId,
      { players: withPlayer(state, seat, withKeys), pendingIdeaToken: null, pendingKey: { remaining: KEYS_FROM_TOKEN } },
      { token, keys: KEYS_FROM_TOKEN },
    );
  }
  // `end-bonus`: draw the top end-bonus card (draw-top ruling, RR8 owns the final call), then owe an
  // idea-card choice — both hold the turn.
  const [top, ...restPile] = state.endBonusPile;
  const drawn = { ...used, endBonus: top ?? null };
  return record(
    state,
    'RESOLVE_IDEA_TOKEN',
    playerId,
    { players: withPlayer(state, seat, drawn), endBonusPile: restPile, pendingIdeaToken: null, pendingIdeaCard: { owed: true } },
    { token, drewEndBonus: top != null },
  );
}
