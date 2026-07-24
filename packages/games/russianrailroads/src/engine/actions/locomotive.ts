import { GameError, ROUTES } from '../core';
import type { Locomotive, RouteId, RussianRailroadsState } from '../core';
import {
  anyEmptyLocoSlot,
  hasEmptyLocoSlot,
  locosOnRoute,
  nextActiveSeat,
  record,
  returnFactory,
  seatOf,
  withPlayer,
} from '../internal';

/**
 * Resolve the pending-locomotive lock (pg. 10–11) — the three loco-resolution actions. The lock's presence
 * and the turn checks are in `applyAction`; these own the placement rules. The starting entry is set by
 * `place` when a locomotive is acquired from a loco action space; each function here consumes/continues that
 * lock. Never mutates the input; throws a typed `GameError`.
 */

/** The route must be one of the player's three (pg. 8). */
function assertRoute(routeId: RouteId): void {
  if (!ROUTES.some((r) => r.id === routeId)) {
    throw new GameError('UNKNOWN_ROUTE', `No route "${routeId}"`);
  }
}

/**
 * `PLACE_LOCO` — put the held locomotive on a route with an empty slot (pg. 10), **ending** the chain. The
 * route must have capacity (`hasEmptyLocoSlot`; Trans-Siberian 2, others 1 — `ILLEGAL_LOCO_PLACEMENT` when
 * full). The lock clears and the turn passes to the next un-passed seat.
 */
export function placeLoco(state: RussianRailroadsState, playerId: string, routeId: RouteId): RussianRailroadsState {
  const pending = state.pendingLoco!; // guaranteed set by applyAction's pending gate
  assertRoute(routeId);

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (!hasEmptyLocoSlot(player, routeId)) {
    throw new GameError('ILLEGAL_LOCO_PLACEMENT', `Route "${routeId}" has no empty locomotive slot`);
  }

  const placed: Locomotive = { number: pending.number, route: routeId };
  const updated = { ...player, locomotives: [...player.locomotives, placed] };
  return record(
    state,
    'PLACE_LOCO',
    playerId,
    { players: withPlayer(state, seat, updated), pendingLoco: null, activePlayerIndex: nextActiveSeat(state)! },
    { route: routeId, number: pending.number },
  );
}

/**
 * `REPLACE_LOCO` — upgrade a lower-numbered locomotive on `route` (pg. 10): the held locomotive takes the
 * slot and the displaced (lower) one **becomes the new pending locomotive** — the "chain reaction" of
 * pg. 11. The target must exist on the route and be strictly lower-numbered (`ILLEGAL_LOCO_UPGRADE`
 * otherwise). Capacity-neutral (a swap), so the lock stays and the turn is kept for the cascade.
 */
export function replaceLoco(
  state: RussianRailroadsState,
  playerId: string,
  routeId: RouteId,
  number: number,
): RussianRailroadsState {
  const pending = state.pendingLoco!; // guaranteed set by applyAction's pending gate
  assertRoute(routeId);

  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  const target = locosOnRoute(player, routeId).find((loco) => loco.number === number);
  if (!target || number >= pending.number) {
    throw new GameError(
      'ILLEGAL_LOCO_UPGRADE',
      `Cannot upgrade a #${number} on "${routeId}" with the #${pending.number} — target must exist and be lower`,
    );
  }

  // Swap: drop the first matching loco on this route, add the held one; the displaced loco cascades.
  let removed = false;
  const locomotives: Locomotive[] = player.locomotives
    .filter((loco) => {
      if (!removed && loco.route === routeId && loco.number === number) {
        removed = true;
        return false;
      }
      return true;
    })
    .concat({ number: pending.number, route: routeId });

  const updated = { ...player, locomotives };
  return record(
    state,
    'REPLACE_LOCO',
    playerId,
    // The displaced loco is now held (chain reaction, pg. 11); the turn stays with the placer.
    { players: withPlayer(state, seat, updated), pendingLoco: { number } },
    { route: routeId, number: pending.number, replaced: number },
  );
}

/**
 * `FLIP_LOCO` — turn the held locomotive to its **factory** side and return it to the supply (pg. 11),
 * ending the chain. Legal **only when the player has no empty locomotive slot on any board** (pg. 11: "As
 * long as you have any empty spaces for locomotives left … you cannot choose to return an upgraded
 * locomotive to the supply as a factory" — `LOCO_FLIP_NOT_ALLOWED`). The returned-factory pool grows by one
 * (RR5 builds from it); the lock clears and the turn passes.
 */
export function flipLoco(state: RussianRailroadsState, playerId: string): RussianRailroadsState {
  const pending = state.pendingLoco!; // guaranteed set by applyAction's pending gate
  const seat = seatOf(state, playerId);
  const player = state.players[seat]!;
  if (anyEmptyLocoSlot(player)) {
    throw new GameError(
      'LOCO_FLIP_NOT_ALLOWED',
      'Cannot flip to a factory while any locomotive slot is empty (pg. 11)',
    );
  }

  return record(
    state,
    'FLIP_LOCO',
    playerId,
    {
      supplies: { ...state.supplies, locomotives: returnFactory(state.supplies.locomotives) },
      pendingLoco: null,
      activePlayerIndex: nextActiveSeat(state)!,
    },
    { number: pending.number },
  );
}
