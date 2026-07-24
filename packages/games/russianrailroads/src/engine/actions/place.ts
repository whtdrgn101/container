import { actionSpace, COINS_PER_ACTION, GameError } from '../core';
import type { RussianRailroadsState, SpacePlacement } from '../core';
import { nextActiveSeat, record, seatOf, withPlayer } from '../internal';

/**
 * Place workers (and/or coins) on an action space and resolve it (pg. 7, 14) — the RR1 worker-placement
 * action. The turn/turn-order checks are in `applyAction`; this owns the space rules:
 *
 *  - the space must exist (`UNKNOWN_SPACE`) and be **unoccupied** (`SPACE_OCCUPIED`) — occupied means any
 *    worker OR coin already sits on it (pg. 7) — **unless** it is the never-occupied bottom track space
 *    (pg. 9), which any number of placements may share;
 *  - the seat must be able to pay the requirement: `coins` of it with coins (pg. 14), the rest with
 *    workers, and it must hold enough of each and not offer more coins than the space needs
 *    (`INSUFFICIENT_WORKERS`).
 *
 * Effect (RR1): the **take-2-coins** space hands the seat 2 coins (pg. 14); the **track** space is a stub
 * (its +1 wood step lands RR2). Then the turn passes to the next un-passed seat (the placer didn't pass,
 * so one always exists). Never mutates the input; throws a typed `GameError`.
 */
export function place(state: RussianRailroadsState, playerId: string, space: string, coins = 0): RussianRailroadsState {
  const def = actionSpace(space);
  if (!def) throw new GameError('UNKNOWN_SPACE', `No action space "${space}"`);

  const existing = state.actionSpaces[space] ?? [];
  if (!def.neverOccupies && existing.length > 0) {
    throw new GameError('SPACE_OCCUPIED', `Action space "${space}" is already occupied this round`);
  }

  if (coins < 0 || coins > def.workers) {
    throw new GameError(
      'INSUFFICIENT_WORKERS',
      `Space "${space}" needs ${def.workers} worker(s); cannot pay ${coins} with coins`,
    );
  }
  const workersNeeded = def.workers - coins;

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (player.workersAvailable < workersNeeded) {
    throw new GameError('INSUFFICIENT_WORKERS', `Not enough workers: need ${workersNeeded}`);
  }
  if (player.coins < coins) {
    throw new GameError('INSUFFICIENT_WORKERS', `Not enough coins: need ${coins}`);
  }

  // The space's reward (RR1): take-2-coins pays 2 coins; the track space is a stub.
  const gainedCoins = def.kind === 'coins' ? COINS_PER_ACTION : 0;

  const updated = {
    ...player,
    workersAvailable: player.workersAvailable - workersNeeded,
    coins: player.coins - coins + gainedCoins,
  };
  const placement: SpacePlacement = { ownerId: playerId, workers: workersNeeded, coins };

  const nextSeat = nextActiveSeat(state)!; // the placer is un-passed, so a next seat always exists

  return record(
    state,
    'PLACE',
    playerId,
    {
      players: withPlayer(state, seat, updated),
      actionSpaces: { ...state.actionSpaces, [space]: [...existing, placement] },
      activePlayerIndex: nextSeat,
    },
    { space, label: def.label, gainedCoins },
  );
}
