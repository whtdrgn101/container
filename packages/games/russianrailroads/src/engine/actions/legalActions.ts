import {
  ACTION_SPACES,
  DOUBLER_SPACES,
  HIRE_COST,
  IDEA_CARDS,
  IDEA_TOKEN_TYPES,
  STARTING_BONUS_CARDS,
  turnOrderOrdinal,
  VARIABLE_ENGINEER_WORKERS,
} from '../core';
import type { ActionSpaceDef, RussianRailroadsState } from '../core';
import {
  accessibleColors,
  advanceWrench,
  allGapsFilled,
  availableReturnedFactories,
  canBuildFactory,
  canBuildLocoAndFactory,
  hiringEngineer,
  legalSteps,
  locoResolutions,
  lowestAvailableLoco,
  seatOf,
  variableEngineer,
} from '../internal';
import type { Action } from './action';

/** Is `space` a legal reuse target for the seat right now (pg. 17) — the resolveReuse-accepting subset? */
function reusableSpace(state: RussianRailroadsState, space: ActionSpaceDef): boolean {
  if (space.workers !== 1 || space.coinCost) return false;
  if (!space.neverOccupies && (state.actionSpaces[space.id]?.length ?? 0) > 0) return false;
  const player = state.players[state.activePlayerIndex]!;
  if (space.track)
    return (
      legalSteps(
        player.routes,
        space.track.colors.filter((c) => accessibleColors(player).includes(c)),
      ).length > 0
    );
  if (space.industry) return advanceWrench(player.industry, space.industry.advance).wrench > player.industry.wrench;
  if (space.kind === 'doubler') return state.supplies.doublers > 0 && player.doublers < DOUBLER_SPACES;
  return space.kind === 'coins' || space.kind === 'temp-workers';
}

/**
 * The actions a seat may legally take right now (RR5). Reads only the active seat's own public board, so it
 * leaks nothing. Russian Railroads has no off-turn moves, so a query for a non-active (or passed, or
 * finished) seat answers empty. Enumerates single steps, never combinatorial distributions — the exact,
 * small set the pending-lock design buys.
 *
 *  - **pending-moves lock** (pg. 8–9): only the legal single `MOVE_TRACK` steps.
 *  - **pending-loco lock** (pg. 10–11): the place / upgrade / flip resolutions.
 *  - **pending-factory lock** (pg. 12): a `PLACE_FACTORY` (leftmost gap) or `REPLACE_FACTORY` (each slot),
 *    once per factory source (the lowest locomotive + each returned factory number).
 *  - **action pool** (pg. 13): a `RESOLVE_POOL` per resolvable credit + `SKIP_POOL`.
 *  - **otherwise**: `PASS`, plus a `PLACE` for every unoccupied space the seat can pay for and that has an
 *    effect (loco/factory options, industrialization advance, colour access, doubler supply — all gated).
 */
export function legalActions(state: RussianRailroadsState, playerId?: string): Action[] {
  if (state.status === 'ended') return [];

  const seat = playerId === undefined ? state.activePlayerIndex : seatOf(state, playerId);
  if (seat !== state.activePlayerIndex) return [];
  const player = state.players[seat]!;
  if (player.passed) return [];

  if (state.pendingMoves) {
    return legalSteps(player.routes, state.pendingMoves.colors).map((step) => ({
      type: 'MOVE_TRACK',
      route: step.route,
      color: step.color,
    }));
  }

  // A pending key (pg. 19): advance a wood + any track, or score 10 points.
  if (state.pendingKey) {
    return [
      { type: 'RESOLVE_KEY', option: 'moves' },
      { type: 'RESOLVE_KEY', option: 'points' },
    ];
  }

  // A pending idea-token choice (pp. 18–19): each unused idea-token type.
  if (state.pendingIdeaToken) {
    return IDEA_TOKEN_TYPES.filter((t) => !player.usedIdeaTokens.includes(t)).map((token) => ({
      type: 'RESOLVE_IDEA_TOKEN',
      token,
    }));
  }

  // A pending idea-card choice (pg. 46–47): each idea card.
  if (state.pendingIdeaCard) {
    return IDEA_CARDS.map((card) => ({ type: 'RESOLVE_IDEA_CARD', card }));
  }

  // Holding a locomotive (pg. 10–11): only the legal place / upgrade / flip resolutions.
  if (state.pendingLoco) {
    return locoResolutions(player, state.pendingLoco.number).map((r) =>
      r.kind === 'place'
        ? { type: 'PLACE_LOCO', route: r.route }
        : r.kind === 'replace'
          ? { type: 'REPLACE_LOCO', route: r.route, number: r.number }
          : { type: 'FLIP_LOCO' },
    );
  }

  // Owing a factory (pg. 12): each placement/replacement × each factory source (lowest loco, returned #n).
  if (state.pendingFactory) {
    const supply = state.supplies.locomotives;
    const froms: (number | undefined)[] = [];
    if (lowestAvailableLoco(supply) !== null) froms.push(undefined); // the lowest locomotive
    for (const n of availableReturnedFactories(supply)) froms.push(n); // each returned factory
    const out: Action[] = [];
    if (!allGapsFilled(player.industry)) {
      for (const from of froms) out.push({ type: 'PLACE_FACTORY', ...(from !== undefined ? { from } : {}) });
    } else {
      for (let slot = 0; slot < player.industry.factories.length; slot += 1) {
        for (const from of froms) out.push({ type: 'REPLACE_FACTORY', slot, ...(from !== undefined ? { from } : {}) });
      }
    }
    return out;
  }

  // Resolving the action pool (pg. 13): a RESOLVE_POOL per spendable credit, plus SKIP_POOL.
  if (player.actionPool.length > 0) {
    const access = accessibleColors(player);
    const out: Action[] = [];
    for (const entry of player.actionPool) {
      if (
        legalSteps(
          player.routes,
          entry.colors.filter((c) => access.includes(c)),
        ).length > 0
      ) {
        out.push({ type: 'RESOLVE_POOL', id: entry.id });
      }
    }
    out.push({ type: 'SKIP_POOL' });
    return out;
  }

  // The game-start setup mini-phase (pg. 6): pick any starting bonus card.
  if (state.pendingSetupBonus) {
    return STARTING_BONUS_CARDS.map((c) => ({ type: 'RESOLVE_SETUP_BONUS', card: c.id }));
  }

  // The between-round reuse mini-phase (pg. 17): move the turn-order worker to a legal 1-worker space.
  if (state.pendingReuse) {
    return ACTION_SPACES.filter((s) => reusableSpace(state, s)).map((s) => ({ type: 'RESOLVE_REUSE', space: s.id }));
  }

  const actions: Action[] = [{ type: 'PASS' }];
  const access = accessibleColors(player);

  /** The loco-space options a PLACE may carry (pg. 12); `{}` for every other space. */
  type PlaceExtra = { readonly build?: 'loco' | 'factory'; readonly first?: 'loco' | 'factory' };

  /** Emit a PLACE for each `extra` param set × each affordable payment (all workers, or coins, pg. 14). */
  const emitPlace = (space: ActionSpaceDef, extras: readonly PlaceExtra[]): void => {
    const coinCost = space.coinCost ?? 0;
    for (const extra of extras) {
      if (coinCost > 0) {
        // Worker+coin space (pg. 9): exactly its workers + its coin, no substitution.
        if (player.workersAvailable >= space.workers && player.coins >= coinCost) {
          actions.push({ type: 'PLACE', space: space.id, ...extra });
        }
        continue;
      }
      if (player.workersAvailable >= space.workers) actions.push({ type: 'PLACE', space: space.id, ...extra });
      if (player.coins >= space.workers)
        actions.push({ type: 'PLACE', space: space.id, coins: space.workers, ...extra });
    }
  };

  for (const space of ACTION_SPACES) {
    const occupied = !space.neverOccupies && (state.actionSpaces[space.id]?.length ?? 0) > 0;
    if (occupied) continue;

    // A track space is only worth offering if some accessible-colour track can actually advance.
    if (space.track) {
      const colors = space.track.colors.filter((c) => access.includes(c));
      if (legalSteps(player.routes, colors).length === 0) continue;
      emitPlace(space, [{}]);
      continue;
    }
    // The doubler space needs a tile in the supply and an empty doubler space (pg. 14).
    if (space.kind === 'doubler') {
      if (state.supplies.doublers <= 0 || player.doublers >= DOUBLER_SPACES) continue;
      emitPlace(space, [{}]);
      continue;
    }
    // A locomotive/factory space (pg. 12): "or" offers whichever of loco/factory the supply can satisfy;
    // "and" needs both.
    if (space.kind === 'locomotive') {
      const supply = state.supplies.locomotives;
      if (space.loco === 'and') {
        if (canBuildLocoAndFactory(supply)) emitPlace(space, [{ first: 'loco' }, { first: 'factory' }]);
        continue;
      }
      const extras: PlaceExtra[] = [];
      if (lowestAvailableLoco(supply) !== null) extras.push({ build: 'loco' });
      if (canBuildFactory(supply)) extras.push({ build: 'factory' });
      emitPlace(space, extras);
      continue;
    }
    // An industrialization space (pg. 13–14): only if the wrench can advance, or its wood bonus can build.
    if (space.industry) {
      const moved = advanceWrench(player.industry, space.industry.advance).wrench > player.industry.wrench;
      const woodOk = !!space.industry.woodMove && legalSteps(player.routes, ['wood']).length > 0;
      if (!moved && !woodOk) continue;
      emitPlace(space, [{}]);
      continue;
    }
    // A turn-order claim space (pg. 16): only if you're not already at that position and haven't claimed one.
    if (space.kind === 'turn-order') {
      const ordinal = turnOrderOrdinal(space.id);
      if (state.turnOrder.indexOf(seat) === ordinal) continue;
      if (state.turnClaims.first === seat || state.turnClaims.second === seat) continue;
      emitPlace(space, [{}]);
      continue;
    }
    // The coins / temp-workers spaces: pay-all-workers or pay-with-coins (pg. 14).
    emitPlace(space, [{}]);
  }

  // Engineers (pg. 15–16, RR7). Hiring the hiring-space engineer (1 coin); using a hired engineer's action
  // (once per round, not inert); using a public variable engineer action space (1 worker, once per round).
  if (hiringEngineer(state.engineerStrip) && player.coins >= HIRE_COST) actions.push({ type: 'HIRE_ENGINEER' });
  for (const engineer of player.hiredEngineers) {
    if (engineer.action.kind !== 'inert' && !player.usedEngineers.includes(engineer.id)) {
      actions.push({ type: 'USE_ENGINEER', engineerId: engineer.id });
    }
  }
  for (const slot of [0, 1]) {
    const engineer = variableEngineer(state.engineerStrip, slot);
    const occupied = (state.actionSpaces[`engineer-var-${slot}`]?.length ?? 0) > 0;
    if (
      engineer &&
      engineer.action.kind !== 'inert' &&
      !occupied &&
      player.workersAvailable >= VARIABLE_ENGINEER_WORKERS
    ) {
      actions.push({ type: 'USE_VARIABLE_ENGINEER', slot });
    }
  }

  return actions;
}
