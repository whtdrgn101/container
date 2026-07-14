import type { Color } from './colors';

/** A built factory. Each factory produces one container of its color per Produce action. */
export interface Factory {
  readonly id: string;
  readonly color: Color;
}

/**
 * A single player's board state.
 *
 * This slice models the factory district (Produce/Build) plus the warehouse *count* and harbor
 * storage limit that the Build action affects. Harbor storage contents, the ship, scoring card,
 * loans, etc. arrive in later slices.
 */
export interface PlayerState {
  readonly id: string;
  readonly name: string;
  /** Cash in hand. */
  readonly money: number;
  /** Built factories. Max 4, each a distinct color. */
  readonly factories: readonly Factory[];
  /** Containers produced and awaiting sale in the factory district (flat list for now). */
  readonly factoryStore: readonly Color[];
  /** Max containers storable in the factory district (2 per built factory). */
  readonly factoryLimit: number;
  /** Number of built warehouses (starts at 1, max 5). */
  readonly warehouses: number;
  /** Max containers storable in the harbor district (1 per built warehouse). */
  readonly harborLimit: number;
}

/** Shared building components still available to build (drawn down as players build). */
export interface Supply {
  /** Factory buildings still available, per color. */
  readonly factories: Readonly<Record<Color, number>>;
  /** Warehouse buildings still available. */
  readonly warehouses: number;
}

/** An append-only record of an applied action, for replay/audit and the backend move log. */
export interface MoveRecord {
  readonly seq: number;
  readonly type: string;
  readonly playerId: string;
  readonly payload?: Record<string, unknown>;
}

/** The complete, serializable state of a game. Plain data — safe to JSON round-trip. */
export interface GameState {
  readonly id: string;
  readonly players: readonly PlayerState[];
  /** Index into `players` of whose turn it is. */
  readonly activePlayerIndex: number;
  /** Actions the active player has left this turn (starts at 2). */
  readonly actionsRemaining: number;
  /** Turn counter, incremented each time a player ends their turn. */
  readonly turn: number;
  /** Shared building supply. */
  readonly supply: Supply;
  /** Monotonic version, incremented once per applied action. Used for optimistic concurrency. */
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
