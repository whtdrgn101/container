import { KEY_POINTS, TRACK_COLORS } from '../core';
import type { PoolEntry, RussianRailroadsState } from '../core';
import { continueTurn, record, seatOf, withPlayer } from '../internal';

/**
 * `RESOLVE_KEY` — resolve one owed key (pg. 19, RR6). The lock's presence + turn checks are in `applyAction`.
 * A key received at a route end-station (or the 2-keys idea token) offers one of two options (the third,
 * Asian-only, is out of scope):
 *
 *  - `'points'` — score **10 points** immediately (pg. 19);
 *  - `'moves'` — advance a **wood** track 1 space **and any** track 1 space (pg. 19): two pool credits (one
 *    wood-only, one any accessible colour), spent one `MOVE_TRACK` at a time via the action pool.
 *
 * Keys resolve one at a time. If `pendingKey.remaining > 1` (the 2-keys token), the lock stays for the next
 * key; otherwise it clears and `continueTurn` hands off (holding for the just-added pool credits, or the
 * next un-fired special / seat). Never mutates; throws typed.
 */
export function resolveKey(
  state: RussianRailroadsState,
  playerId: string,
  option: 'moves' | 'points',
): RussianRailroadsState {
  const lock = state.pendingKey!; // guaranteed set by applyAction's pending gate
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;

  let updated = player;
  if (option === 'points') {
    updated = { ...player, score: player.score + KEY_POINTS };
  } else {
    // Two pool credits: 1 wood step + 1 any-accessible-colour step (pg. 19). Ids are unique within the turn.
    const n = player.actionPool.length;
    const credits: PoolEntry[] = [
      { id: `key-wood#${n}`, count: 1, colors: ['wood'] },
      { id: `key-any#${n + 1}`, count: 1, colors: TRACK_COLORS },
    ];
    updated = { ...player, actionPool: [...player.actionPool, ...credits] };
  }

  // More keys owed (the 2-keys token): keep the lock for the next one, holding the turn.
  if (lock.remaining > 1) {
    return record(
      state,
      'RESOLVE_KEY',
      playerId,
      { players: withPlayer(state, seat, updated), pendingKey: { remaining: lock.remaining - 1 } },
      { option, remaining: lock.remaining - 1 },
    );
  }
  const next = { ...state, players: withPlayer(state, seat, updated), pendingKey: null };
  return record(state, 'RESOLVE_KEY', playerId, { pendingKey: null, ...continueTurn(next, seat) }, { option });
}
