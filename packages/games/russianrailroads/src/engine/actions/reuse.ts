import { actionSpace, COINS_PER_ACTION, DOUBLER_SPACES, GameError, TEMP_WORKERS } from '../core';
import type { PoolEntry, RussianRailroadsState, SpacePlacement } from '../core';
import { accessibleColors, advanceWrench, continueTurn, legalSteps, record, seatOf, triggerEffect, withPlayer } from '../internal';

/**
 * `RESOLVE_REUSE` — the between-round worker-reuse mini-phase (pg. 17, RR6). The head seat of `pendingReuse`
 * moves its turn-order worker onto an **empty 1-worker** action space and resolves it; gains are usable next
 * round (which is exactly when this runs — at the top of the new round, before placement). The turn / queue
 * checks are in `applyAction`.
 *
 * Faithful bounded scope (documented): reuse targets the **direct-action** 1-worker spaces — coins, a doubler,
 * temp workers, industrialize-1, and the track-extension spaces (which open the moves lock; the bottom space
 * is always available, pg. 17). It excludes the worker+coin space (no combining with a coin, pg. 17) and the
 * loco / turn-order spaces (`ILLEGAL_REUSE_SPACE`) — reusing those is deferred. Never mutates; throws typed.
 */
export function resolveReuse(state: RussianRailroadsState, playerId: string, space: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const def = actionSpace(space);
  // A 1-worker space with no mandatory coin (pg. 17: exactly 1 worker, no combining).
  if (!def || def.workers !== 1 || def.coinCost) {
    throw new GameError('ILLEGAL_REUSE_SPACE', `Space "${space}" is not a reusable 1-worker space (pg. 17)`);
  }
  const existing = state.actionSpaces[space] ?? [];
  if (!def.neverOccupies && existing.length > 0) {
    throw new GameError('ILLEGAL_REUSE_SPACE', `Space "${space}" is already occupied`);
  }
  // Occupy it for the mini-phase (so the 1st-place claimant can't reuse the same space); cleared when the
  // queue empties and the round opens.
  const placement: SpacePlacement = { ownerId: playerId, workers: 1, coins: 0 };
  const actionSpaces = { ...state.actionSpaces, [space]: [...existing, placement] };
  const payload = { space, label: def.label };

  // A track-extension space: open the moves lock; the worker resolves it, then `MOVE_TRACK`→`continueTurn`
  // advances the queue. If nothing can build, the move is forfeit and the queue advances now.
  if (def.track) {
    const colors = def.track.colors.filter((c) => accessibleColors(player).includes(c));
    if (legalSteps(player.routes, colors).length > 0) {
      return record(
        state,
        'RESOLVE_REUSE',
        playerId,
        { actionSpaces, pendingMoves: { remaining: def.track.moves, colors } },
        { ...payload, moves: def.track.moves },
      );
    }
    const next = { ...state, actionSpaces };
    return record(state, 'RESOLVE_REUSE', playerId, { actionSpaces, ...continueTurn(next, seat) }, { ...payload, moves: 0 });
  }

  // Industrialize-1: advance the wrench, auto-resolving coin factories and pooling track-move factories.
  if (def.industry) {
    const { wrench, triggered } = advanceWrench(player.industry, def.industry.advance);
    let coinsGained = 0;
    const pool: PoolEntry[] = [];
    triggered.forEach((n, i) => {
      const eff = triggerEffect(n);
      coinsGained += eff.coins;
      if (eff.move) pool.push({ id: `factory:${n}#${i}`, count: eff.move.count, colors: eff.move.colors });
    });
    const updated = { ...player, industry: { ...player.industry, wrench }, coins: player.coins + coinsGained, actionPool: pool };
    const next = { ...state, players: withPlayer(state, seat, updated), actionSpaces };
    return record(
      state,
      'RESOLVE_REUSE',
      playerId,
      { actionSpaces, ...continueTurn(next, seat) },
      { ...payload, advanced: wrench - player.industry.wrench },
    );
  }

  // A doubler (needs supply + an empty doubler space).
  if (def.kind === 'doubler') {
    if (state.supplies.doublers <= 0 || player.doublers >= DOUBLER_SPACES) {
      throw new GameError('ILLEGAL_REUSE_SPACE', 'No doubler tile can be taken');
    }
    const updated = { ...player, doublers: player.doublers + 1 };
    const supplies = { ...state.supplies, doublers: state.supplies.doublers - 1 };
    const next = { ...state, players: withPlayer(state, seat, updated), actionSpaces, supplies };
    return record(state, 'RESOLVE_REUSE', playerId, { actionSpaces, supplies, ...continueTurn(next, seat) }, payload);
  }

  // The direct resource spaces (coins / temp workers). Loco + turn-order spaces are not reusable.
  let updated = player;
  if (def.kind === 'coins') {
    updated = { ...player, coins: player.coins + COINS_PER_ACTION };
  } else if (def.kind === 'temp-workers') {
    updated = { ...player, tempWorkers: player.tempWorkers + TEMP_WORKERS, workersAvailable: player.workersAvailable + TEMP_WORKERS };
  } else {
    throw new GameError('ILLEGAL_REUSE_SPACE', `Space "${space}" (kind ${def.kind}) is not reusable (pg. 17)`);
  }
  const next = { ...state, players: withPlayer(state, seat, updated), actionSpaces };
  return record(state, 'RESOLVE_REUSE', playerId, { actionSpaces, ...continueTurn(next, seat) }, payload);
}
