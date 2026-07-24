import { actionSpace, COINS_PER_ACTION, DOUBLER_SPACES, GameError, TEMP_WORKERS } from '../core';
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

  // The doubler space can't be chosen when the supply is empty or all doubler spaces are filled (pg. 14).
  if (def.kind === 'doubler') {
    const activeSeat = seatOf(state, playerId);
    if (state.supplies.doublers <= 0 || state.players[activeSeat]!.doublers >= DOUBLER_SPACES) {
      throw new GameError('DOUBLER_UNAVAILABLE', 'No doubler tile can be taken (supply empty or spaces full)');
    }
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

  // Every space first spends the worker/coin payment; the effect then differs by kind.
  const paid = {
    ...player,
    workersAvailable: player.workersAvailable - workersNeeded,
    coins: player.coins - totalCoins,
  };

  // A track-extension space (pg. 8–9): set the pending lock, constrained to the space's *accessible*
  // colours, and keep the turn — unless nothing can advance, in which case the moves are forfeit and the
  // turn advances now (pg. 9 "as many as you are able to").
  if (def.track) {
    const players = withPlayer(state, seat, paid);
    const colors = def.track.colors.filter((c) => accessibleColors(paid).includes(c));
    if (legalSteps(paid.routes, colors).length > 0) {
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

  // The doubler space (pg. 14): take one tile from the shared supply onto the next Trans-Siberian doubler
  // space (the count fills left to right), then pass the turn.
  if (def.kind === 'doubler') {
    const updated = { ...paid, doublers: paid.doublers + 1 };
    return record(
      state,
      'PLACE',
      playerId,
      {
        players: withPlayer(state, seat, updated),
        actionSpaces,
        supplies: { ...state.supplies, doublers: state.supplies.doublers - 1 },
        activePlayerIndex: nextActiveSeat(state)!,
      },
      { space, label: def.label, doubler: updated.doublers },
    );
  }

  // The temporary-workers space (pg. 15): take the 2 turquoise workers into the supply for this round
  // (also counted in `workersAvailable`), then pass the turn. They are returned at round end.
  if (def.kind === 'temp-workers') {
    const updated = {
      ...paid,
      tempWorkers: paid.tempWorkers + TEMP_WORKERS,
      workersAvailable: paid.workersAvailable + TEMP_WORKERS,
    };
    return record(
      state,
      'PLACE',
      playerId,
      { players: withPlayer(state, seat, updated), actionSpaces, activePlayerIndex: nextActiveSeat(state)! },
      { space, label: def.label, tempWorkers: TEMP_WORKERS },
    );
  }

  // The take-2-coins space (pg. 14): gain coins and pass the turn.
  const gainedCoins = COINS_PER_ACTION;
  const updated = { ...paid, coins: paid.coins + gainedCoins };
  return record(
    state,
    'PLACE',
    playerId,
    { players: withPlayer(state, seat, updated), actionSpaces, activePlayerIndex: nextActiveSeat(state)! },
    { space, label: def.label, gainedCoins },
  );
}
