import { actionSpace, COINS_PER_ACTION, GameError } from '../core';
import type { RussianRailroadsState, SpacePlacement } from '../core';
import { accessibleColors, legalSteps, nextActiveSeat, record, seatOf, withPlayer } from '../internal';

/**
 * Place workers (and/or coins) on an action space and resolve it (pg. 7, 9, 14). The turn/turn-order and
 * pending-lock checks are in `applyAction`; this owns the space rules:
 *
 *  - the space must exist (`UNKNOWN_SPACE`) and be **unoccupied** (`SPACE_OCCUPIED`) — occupied means any
 *    worker OR coin already sits on it (pg. 7) — **unless** it is the never-occupied bottom track space
 *    (pg. 9), which any number of placements may share;
 *  - the seat must be able to pay: the space's mandatory `coinCost` (pg. 9 worker+coin space) plus its
 *    workers, of which `coins` may be paid with coins as substitutes (pg. 14). A worker+coin space forbids
 *    that substitution — its worker is mandatory (`coins` must be 0 there). It must hold enough of each and
 *    not offer more substitute coins than the space needs (`INSUFFICIENT_WORKERS`).
 *
 * Effect: the **take-2-coins** space hands the seat 2 coins (pg. 14) and passes the turn. A **track**
 * space (pg. 8–9) instead sets the pending-moves lock (`remaining` = the space's moves, constrained to the
 * accessible colours) and **keeps the turn with the placer**, who resolves it via `MOVE_TRACK` — unless no
 * legal step is possible (all tracks at the route end / blocked), in which case the moves are forfeit and
 * the turn passes immediately ("as many as you are able to" — the Container Produce precedent). Never
 * mutates the input; throws a typed `GameError`.
 */
export function place(state: RussianRailroadsState, playerId: string, space: string, coins = 0): RussianRailroadsState {
  const def = actionSpace(space);
  if (!def) throw new GameError('UNKNOWN_SPACE', `No action space "${space}"`);

  const existing = state.actionSpaces[space] ?? [];
  if (!def.neverOccupies && existing.length > 0) {
    throw new GameError('SPACE_OCCUPIED', `Action space "${space}" is already occupied this round`);
  }

  const coinCost = def.coinCost ?? 0;
  if (coinCost > 0 && coins !== 0) {
    throw new GameError(
      'INSUFFICIENT_WORKERS',
      `Space "${space}" needs a real worker plus its coin — no coin substitution here (pg. 9)`,
    );
  }
  if (coins < 0 || coins > def.workers) {
    throw new GameError(
      'INSUFFICIENT_WORKERS',
      `Space "${space}" needs ${def.workers} worker(s); cannot pay ${coins} with coins`,
    );
  }
  const workersNeeded = def.workers - coins;
  const totalCoins = coins + coinCost;

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (player.workersAvailable < workersNeeded) {
    throw new GameError('INSUFFICIENT_WORKERS', `Not enough workers: need ${workersNeeded}`);
  }
  if (player.coins < totalCoins) {
    throw new GameError('INSUFFICIENT_WORKERS', `Not enough coins: need ${totalCoins}`);
  }

  const placement: SpacePlacement = { ownerId: playerId, workers: workersNeeded, coins: totalCoins };
  const actionSpaces = { ...state.actionSpaces, [space]: [...existing, placement] };

  // A track-extension space (pg. 8–9): spend the payment, then set the pending lock.
  if (def.track) {
    const spent = {
      ...player,
      workersAvailable: player.workersAvailable - workersNeeded,
      coins: player.coins - totalCoins,
    };
    const players = withPlayer(state, seat, spent);
    const colors = def.track.colors.filter((c) => accessibleColors(spent).includes(c));
    // The lock is playable only if some accessible-colour track can actually advance; otherwise the moves
    // are forfeit and the turn advances now (pg. 9 "as many as you are able to").
    if (legalSteps(spent.routes, colors).length > 0) {
      return record(
        state,
        'PLACE',
        playerId,
        { players, actionSpaces, pendingMoves: { remaining: def.track.moves, colors } },
        { space, label: def.label, moves: def.track.moves },
      );
    }
    return record(
      state,
      'PLACE',
      playerId,
      { players, actionSpaces, activePlayerIndex: nextActiveSeat(state)!, pendingMoves: null },
      { space, label: def.label, moves: 0 },
    );
  }

  // The only non-track space in RR2 is the take-2-coins space (pg. 14): gain coins and pass the turn.
  const gainedCoins = COINS_PER_ACTION;
  const updated = {
    ...player,
    workersAvailable: player.workersAvailable - workersNeeded,
    coins: player.coins - totalCoins + gainedCoins,
  };
  return record(
    state,
    'PLACE',
    playerId,
    { players: withPlayer(state, seat, updated), actionSpaces, activePlayerIndex: nextActiveSeat(state)! },
    { space, label: def.label, gainedCoins },
  );
}
