import { DOUBLER_SPACES, GameError, HIRE_COST, VARIABLE_ENGINEER_WORKERS } from '../core';
import type {
  EngineerAction,
  RussianRailroadsPlayer,
  RussianRailroadsState,
  RussianRailroadsSupplies,
  SpacePlacement,
} from '../core';
import {
  accessibleColors,
  continueTurn,
  hiringEngineer,
  legalSteps,
  nextActiveSeat,
  record,
  seatOf,
  takeHiring,
  variableEngineer,
  withPlayer,
} from '../internal';

/**
 * The engineer actions (pg. 7, 15–16, RR7). Three turn actions:
 *  - `HIRE_ENGINEER` — pay 1 coin, take the hiring-space engineer (a normal turn, pg. 15);
 *  - `USE_ENGINEER` — use a hired engineer's action as an **indirect** action, once per round (pg. 15): a
 *    track-move feeds the action pool (skippable), an immediate effect resolves at once;
 *  - `USE_VARIABLE_ENGINEER` — use a public variable engineer action space as a **direct** action for 1
 *    worker (pg. 15–16): a track-move opens the pending-moves lock directly (must resolve).
 *
 * The turn / lock checks live in `applyAction`; this owns the engineer rules. Never mutates; throws typed.
 */

/** The immediate (non-track) resolution of an engineer action — coins / doubler / points. */
function immediateEffect(
  state: RussianRailroadsState,
  player: RussianRailroadsPlayer,
  action: Exclude<EngineerAction, { kind: 'moveTrack' } | { kind: 'inert' }>,
): { readonly player: RussianRailroadsPlayer; readonly supplies?: RussianRailroadsSupplies } {
  if (action.kind === 'coins') {
    return { player: { ...player, coins: player.coins + action.count } };
  }
  if (action.kind === 'doubler') {
    // Take a doubler tile if one can be taken (pg. 14 — supply left and an empty doubler space); always
    // score the points (pg. 15 variable-engineer example: "take 1 doubler tile … you also score 5 points").
    const canDouble = state.supplies.doublers > 0 && player.doublers < DOUBLER_SPACES;
    return {
      player: { ...player, doublers: player.doublers + (canDouble ? 1 : 0), score: player.score + action.points },
      supplies: canDouble ? { ...state.supplies, doublers: state.supplies.doublers - 1 } : undefined,
    };
  }
  // The scoring engineers (pg. 48): a fixed value, the sum of engineer numbers, or the 2 highest locomotives.
  const points =
    action.kind === 'score'
      ? action.points
      : action.kind === 'scoreEngineers'
        ? player.hiredEngineers.reduce((sum, e) => sum + e.number, 0)
        : [...player.locomotives]
            .map((l) => l.number)
            .sort((a, b) => b - a)
            .slice(0, 2)
            .reduce((sum, n) => sum + n, 0);
  return { player: { ...player, score: player.score + points } };
}

/**
 * `HIRE_ENGINEER` (pg. 15): pay 1 coin, take the right-most (hiring-space) engineer beside your board. The
 * hiring slot is emptied (so a hired engineer never returns to the box, and only one hire happens per round),
 * and the turn passes. Throws `NO_ENGINEER_TO_HIRE` (empty hiring space) or `INSUFFICIENT_COINS`.
 */
export function hireEngineer(state: RussianRailroadsState, playerId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const engineer = hiringEngineer(state.engineerStrip);
  if (!engineer) throw new GameError('NO_ENGINEER_TO_HIRE', 'No engineer is available to hire this round (pg. 15)');
  if (player.coins < HIRE_COST) throw new GameError('INSUFFICIENT_COINS', `Hiring costs ${HIRE_COST} coin (pg. 15)`);

  const updated = {
    ...player,
    coins: player.coins - HIRE_COST,
    hiredEngineers: [...player.hiredEngineers, engineer],
  };
  return record(
    state,
    'HIRE_ENGINEER',
    playerId,
    {
      players: withPlayer(state, seat, updated),
      engineerStrip: takeHiring(state.engineerStrip),
      activePlayerIndex: nextActiveSeat(state)!,
    },
    { engineerId: engineer.id, number: engineer.number },
  );
}

/**
 * `USE_ENGINEER` (pg. 7, 15): use a hired engineer's action as an **indirect** action, once per round. A
 * `moveTrack` action grants an action-pool credit (partially resolvable / skippable); every other kind
 * resolves immediately, then the turn hands off. Throws `ENGINEER_NOT_HIRED`, `ENGINEER_ALREADY_USED`, or
 * `ENGINEER_INERT`.
 */
export function useEngineer(state: RussianRailroadsState, playerId: string, engineerId: string): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const engineer = player.hiredEngineers.find((e) => e.id === engineerId);
  if (!engineer) throw new GameError('ENGINEER_NOT_HIRED', `You have not hired engineer "${engineerId}" (pg. 15)`);
  if (player.usedEngineers.includes(engineerId)) {
    throw new GameError('ENGINEER_ALREADY_USED', `Engineer "${engineerId}" is already used this round (pg. 15)`);
  }
  const action = engineer.action;
  if (action.kind === 'inert')
    throw new GameError('ENGINEER_INERT', `Engineer "${engineerId}" has no resolvable action`);

  const used = { ...player, usedEngineers: [...player.usedEngineers, engineerId] };
  const payload = { engineerId, number: engineer.number, kind: action.kind };

  if (action.kind === 'moveTrack') {
    // Indirect (pg. 15): grant a pool credit; `continueTurn` holds the turn to resolve or skip it.
    const withCredit = {
      ...used,
      actionPool: [...used.actionPool, { id: `engineer:${engineerId}`, count: action.count, colors: action.colors }],
    };
    const next = { ...state, players: withPlayer(state, seat, withCredit) };
    return record(state, 'USE_ENGINEER', playerId, continueTurn(next, seat), payload);
  }

  const { player: resolved, supplies } = immediateEffect(state, used, action);
  const next = { ...state, players: withPlayer(state, seat, resolved), ...(supplies ? { supplies } : {}) };
  return record(
    state,
    'USE_ENGINEER',
    playerId,
    { ...(supplies ? { supplies } : {}), ...continueTurn(next, seat) },
    payload,
  );
}

/**
 * `USE_VARIABLE_ENGINEER` (pg. 15–16): use one of the two public variable engineer action spaces as a
 * **direct** action for 1 worker, occupied once per round. A `moveTrack` opens the pending-moves lock
 * directly (must resolve, unless nothing can advance — then it is forfeit, the RR2 precedent); every other
 * kind resolves immediately. Throws `NO_VARIABLE_ENGINEER`, `ENGINEER_INERT`, `SPACE_OCCUPIED`, or
 * `INSUFFICIENT_WORKERS`.
 */
export function useVariableEngineer(
  state: RussianRailroadsState,
  playerId: string,
  slot: number,
): RussianRailroadsState {
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const engineer = variableEngineer(state.engineerStrip, slot);
  if (!engineer) throw new GameError('NO_VARIABLE_ENGINEER', `No variable engineer in slot ${slot} (pg. 15)`);
  const action = engineer.action;
  if (action.kind === 'inert')
    throw new GameError('ENGINEER_INERT', `Variable engineer slot ${slot} has no resolvable action`);

  const spaceId = `engineer-var-${slot}`;
  const existing = state.actionSpaces[spaceId] ?? [];
  if (existing.length > 0)
    throw new GameError('SPACE_OCCUPIED', `Variable engineer ${slot} is already used this round`);
  if (player.workersAvailable < VARIABLE_ENGINEER_WORKERS) {
    throw new GameError('INSUFFICIENT_WORKERS', `Need ${VARIABLE_ENGINEER_WORKERS} worker (pg. 15)`);
  }

  const placement: SpacePlacement = { ownerId: playerId, workers: VARIABLE_ENGINEER_WORKERS, coins: 0 };
  const actionSpaces = { ...state.actionSpaces, [spaceId]: [...existing, placement] };
  const paid = { ...player, workersAvailable: player.workersAvailable - VARIABLE_ENGINEER_WORKERS };
  const payload = { slot, engineerId: engineer.id, number: engineer.number, kind: action.kind };

  if (action.kind === 'moveTrack') {
    // Direct (pg. 15): open the pending-moves lock, keep the turn — unless nothing can advance, in which case
    // the moves are forfeit and the turn passes now (pg. 9 "as many as you are able to").
    const colors = action.colors.filter((c) => accessibleColors(paid).includes(c));
    const players = withPlayer(state, seat, paid);
    if (legalSteps(paid.routes, colors).length > 0) {
      return record(
        state,
        'USE_VARIABLE_ENGINEER',
        playerId,
        {
          players,
          actionSpaces,
          pendingMoves: { remaining: action.count, colors },
        },
        payload,
      );
    }
    return record(
      state,
      'USE_VARIABLE_ENGINEER',
      playerId,
      {
        players,
        actionSpaces,
        activePlayerIndex: nextActiveSeat(state)!,
      },
      { ...payload, moves: 0 },
    );
  }

  const { player: resolved, supplies } = immediateEffect(state, paid, action);
  const next = {
    ...state,
    players: withPlayer(state, seat, resolved),
    actionSpaces,
    ...(supplies ? { supplies } : {}),
  };
  return record(
    state,
    'USE_VARIABLE_ENGINEER',
    playerId,
    { actionSpaces, ...(supplies ? { supplies } : {}), ...continueTurn(next, seat) },
    payload,
  );
}
