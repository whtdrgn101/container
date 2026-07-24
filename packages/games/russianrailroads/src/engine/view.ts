import type { GameEndState, Viewer } from '@game-hub/kernel';
import type {
  EndBonusCard,
  Engineer,
  Industry,
  Locomotive,
  Route,
  RussianRailroadsResult,
  RussianRailroadsState,
  RussianRailroadsSupplies,
  SpacePlacement,
} from './core';

// `Viewer` is a kernel primitive; re-export it so consumers import it from this surface.
export type { Viewer } from '@game-hub/kernel';

/**
 * A player projected for a viewer (pg. 22). The game's **one secret** is the held end-bonus card: an
 * opponent sees `endBonus: null` and only `endBonusHeld` (how many they hold — 0 or 1). Everything else
 * on a player board is public (pg. 7 — the whole game is open information but for this card).
 */
export interface PlayerView {
  readonly id: string;
  readonly name: string;
  readonly workersAvailable: number;
  readonly workersTotal: number;
  readonly coins: number;
  readonly routes: readonly Route[];
  readonly locomotives: readonly Locomotive[];
  readonly industry: Industry;
  readonly hiredEngineers: readonly Engineer[];
  readonly actionPool: readonly string[];
  /** The held end-bonus card when the viewer owns this seat (or the game has ended); `null` otherwise. */
  readonly endBonus: EndBonusCard | null;
  /** How many end-bonus cards this player holds — always visible (0 or 1 in the base game). */
  readonly endBonusHeld: number;
  readonly turnOrderCard: number;
  readonly passed: boolean;
}

/**
 * A Russian Railroads game projected for a viewer — the same shape as the state, with the two secrets
 * redacted: each opponent's held end-bonus card (→ a count) and the face-down end-bonus pile (→ a count).
 */
// Intersection (not `interface extends`) so it distributes over the end-state union and keeps the
// `status` discriminant.
export type RussianRailroadsView = {
  readonly id: string;
  readonly players: readonly PlayerView[];
  readonly actionSpaces: Readonly<Record<string, readonly SpacePlacement[]>>;
  readonly engineerStrip: readonly (Engineer | null)[];
  /** The number of cards left in the face-down end-bonus pile (its order is secret). */
  readonly endBonusPileCount: number;
  readonly turnOrder: readonly number[];
  readonly activePlayerIndex: number;
  readonly round: number;
  readonly rounds: number;
  readonly supplies: RussianRailroadsSupplies;
  readonly viewerId: Viewer;
  readonly version: number;
  readonly log: RussianRailroadsState['log'];
} & GameEndState<RussianRailroadsResult>;

/** Does `viewer` own the seat `playerId` (so its secrets are visible)? A spectator (`null`/`[]`) owns none. */
function owns(viewer: Viewer, playerId: string): boolean {
  if (viewer === null) return false;
  if (typeof viewer === 'string') return viewer === playerId;
  return viewer.includes(playerId);
}

/**
 * Project `state` for `viewer` — the only thing standing between a client and another player's secret.
 *
 * Each opponent's held end-bonus card is redacted to a count; the end-bonus pile becomes a count. Once the
 * game has `ended` everything is revealed (final scoring is public — the same rule the other games use for
 * their end-of-game secrets).
 */
export function viewFor(state: RussianRailroadsState, viewer: Viewer): RussianRailroadsView {
  const revealAll = state.status === 'ended';

  const players: PlayerView[] = state.players.map((player) => {
    const mine = revealAll || owns(viewer, player.id);
    return {
      id: player.id,
      name: player.name,
      workersAvailable: player.workersAvailable,
      workersTotal: player.workersTotal,
      coins: player.coins,
      routes: player.routes,
      locomotives: player.locomotives,
      industry: player.industry,
      hiredEngineers: player.hiredEngineers,
      actionPool: player.actionPool,
      endBonus: mine ? player.endBonus : null,
      endBonusHeld: player.endBonus ? 1 : 0,
      turnOrderCard: player.turnOrderCard,
      passed: player.passed,
    };
  });

  const { endBonusPile: _pile, players: _players, ...rest } = state;
  return {
    ...rest,
    players,
    endBonusPileCount: state.endBonusPile.length,
    viewerId: viewer,
  };
}
