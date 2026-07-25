import {
  actionSpace,
  COINS_PER_ACTION,
  DOUBLER_SPACES,
  GameError,
  spaceAvailable,
  TEMP_WORKERS,
  TRACK_COLORS,
  turnOrderOrdinal,
} from '../core';
import type { PoolEntry, RussianRailroadsState, SpacePlacement } from '../core';
import {
  accessibleColors,
  advanceWrench,
  canBuildFactory,
  canBuildLocoAndFactory,
  continueTurn,
  legalSteps,
  nextActiveSeat,
  record,
  seatOf,
  takeLowestLoco,
  triggerEffect,
  withPlayer,
} from '../internal';

/**
 * The extra move the **wood-worker** idea card grants (pg. 47): +1 when placing on a space that
 * *specifically* shows wood track — the dedicated wood spaces (`['wood']`) and the bottom wood/green space,
 * but **not** an "any track" space (all five colours, e.g. the worker+coin space). 0 without the card.
 */
function woodWorkerBonus(player: RussianRailroadsState['players'][number], colors: readonly string[]): number {
  return player.woodWorker && colors.includes('wood') && colors.length < TRACK_COLORS.length ? 1 : 0;
}

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
export function place(
  state: RussianRailroadsState,
  playerId: string,
  space: string,
  coins = 0,
  build: 'loco' | 'factory' = 'loco',
  first: 'loco' | 'factory' = 'loco',
): RussianRailroadsState {
  const def = actionSpace(space);
  if (!def) throw new GameError('UNKNOWN_SPACE', `No action space "${space}"`);
  // The last-round tile (pg. 22): the turn-order claim spaces are covered in the final round (and replaced
  // by the "advance 3 industry" space), so each is unavailable in the other rounds.
  if (!spaceAvailable(def, state.round, state.rounds)) {
    throw new GameError('SPACE_UNAVAILABLE', `Action space "${space}" is not available this round (pg. 22)`);
  }

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
    // The wood-worker idea card adds a move on a wood-specific space (pg. 47).
    const moves = def.track.moves + woodWorkerBonus(paid, def.track.colors);
    if (legalSteps(paid.routes, colors).length > 0) {
      return record(
        state,
        'PLACE',
        playerId,
        { players, actionSpaces, pendingMoves: { remaining: moves, colors } },
        { space, label: def.label, moves },
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

  // A locomotive/factory action space (pg. 10, 12). The upper/middle spaces (`loco: 'or'`) build a
  // locomotive OR a factory (chosen by `build`); the bottom (`loco: 'and'`) builds both, in the order
  // `first`. A locomotive is taken now and opens the pending-loco lock; a factory opens the pending-factory
  // lock (its tile is chosen at resolution — pg. 12, so an upgrade first can feed the just-returned
  // factory). `legalActions` only offers the option(s) the supply can satisfy, so a resolution always exists.
  if (def.kind === 'locomotive') {
    const players = withPlayer(state, seat, paid);
    // The 3-worker "loco AND factory" space (pg. 12): open the first build, owe the other via `pendingThen`.
    if (def.loco === 'and') {
      if (!canBuildLocoAndFactory(state.supplies.locomotives)) {
        throw new GameError('FACTORY_UNAVAILABLE', 'Cannot build both a locomotive and a factory (pg. 12)');
      }
      if (first === 'factory') {
        return record(
          state,
          'PLACE',
          playerId,
          { players, actionSpaces, pendingFactory: { owed: true }, pendingThen: 'loco' },
          { space, label: def.label, first },
        );
      }
      const { number, supply } = takeLowestLoco(state.supplies.locomotives);
      return record(
        state,
        'PLACE',
        playerId,
        {
          players,
          actionSpaces,
          supplies: { ...state.supplies, locomotives: supply },
          pendingLoco: { number },
          pendingThen: 'factory',
        },
        { space, label: def.label, first, acquired: number },
      );
    }
    // The "loco OR factory" spaces (pg. 12): a factory owes a placement; a locomotive is taken now.
    if (build === 'factory') {
      if (!canBuildFactory(state.supplies.locomotives)) {
        throw new GameError('FACTORY_UNAVAILABLE', 'No locomotive or returned factory to build (pg. 12)');
      }
      return record(
        state,
        'PLACE',
        playerId,
        { players, actionSpaces, pendingFactory: { owed: true } },
        { space, label: def.label, build },
      );
    }
    const { number, supply } = takeLowestLoco(state.supplies.locomotives);
    return record(
      state,
      'PLACE',
      playerId,
      { players, actionSpaces, supplies: { ...state.supplies, locomotives: supply }, pendingLoco: { number } },
      { space, label: def.label, acquired: number },
    );
  }

  // An industrialization action space (pg. 13–14): advance the wrench, resolving each factory it moves onto.
  // Coin factories auto-resolve (choiceless); track-move factories + the bottom space's wood bonus become
  // pool credits, resolved this turn via RESOLVE_POOL (keeping the turn) or forfeited with SKIP_POOL.
  if (def.industry) {
    const { advance, woodMove } = def.industry;
    const { wrench, triggered } = advanceWrench(paid.industry, advance);
    let coinsGained = 0;
    const pool: PoolEntry[] = [];
    triggered.forEach((factoryNumber, i) => {
      const eff = triggerEffect(factoryNumber);
      coinsGained += eff.coins;
      if (eff.move) pool.push({ id: `factory:${factoryNumber}#${i}`, count: eff.move.count, colors: eff.move.colors });
    });
    if (woodMove) pool.push({ id: `industry-wood#${pool.length}`, count: woodMove, colors: ['wood'] });

    const updated = {
      ...paid,
      industry: { ...paid.industry, wrench },
      coins: paid.coins + coinsGained,
      actionPool: pool,
    };
    const next = { ...state, players: withPlayer(state, seat, updated), actionSpaces };
    const payload = { space, label: def.label, advanced: wrench - paid.industry.wrench, wrench, coinsGained };
    // `continueTurn` keeps the turn for pool credits or the industry idea space (pg. 19), else passes it.
    return record(
      state,
      'PLACE',
      playerId,
      { actionSpaces, ...continueTurn(next, seat) },
      pool.length > 0 ? { ...payload, pooled: pool.length } : payload,
    );
  }

  // A turn-order claim space (pg. 16): buy first / second place for next round. No immediate effect — the
  // rearrangement happens at round end. Refuse claiming below your own pawn or claiming both spaces.
  if (def.kind === 'turn-order') {
    const ordinal = turnOrderOrdinal(space); // 0 = first place, 1 = second place
    if (state.turnOrder.indexOf(seat) === ordinal) {
      throw new GameError('TURN_ORDER_OWN_PAWN', 'You cannot claim the space below your own pawn (pg. 16)');
    }
    if (state.turnClaims.first === seat || state.turnClaims.second === seat) {
      throw new GameError('TURN_ORDER_ALREADY_CLAIMED', 'You cannot claim both turn-order spaces (pg. 16)');
    }
    const turnClaims = ordinal === 0 ? { ...state.turnClaims, first: seat } : { ...state.turnClaims, second: seat };
    return record(
      state,
      'PLACE',
      playerId,
      { players: withPlayer(state, seat, paid), actionSpaces, turnClaims, activePlayerIndex: nextActiveSeat(state)! },
      { space, label: def.label, claim: ordinal === 0 ? 'first' : 'second' },
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
