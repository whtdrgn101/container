import type { Color } from './colors';

/** A built factory. Each factory produces one container of its color per Produce action. */
export interface Factory {
  readonly id: string;
  readonly color: Color;
}

/**
 * A single player's board state.
 *
 * For this vertical slice we model only the factory district (the part the
 * Produce action touches). The harbor district, ship, scoring card, loans, etc.
 * are added in the full engine (Phase 2).
 */
export interface PlayerState {
  readonly id: string;
  readonly name: string;
  /** Cash in hand. */
  readonly money: number;
  /** Built factories. Max 4, each a distinct color (not yet enforced in the slice). */
  readonly factories: readonly Factory[];
  /**
   * Containers produced and awaiting sale in the factory district.
   * A flat list for now; price-lot arrangement arrives with the Reprice/Purchase actions.
   */
  readonly factoryStore: readonly Color[];
  /** Max containers storable in the factory district (2 per built factory). */
  readonly factoryLimit: number;
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
  /** Index into `players` of whose turn it is. Turn/action enforcement lands in Phase 2. */
  readonly activePlayerIndex: number;
  /** Monotonic version, incremented once per applied action. Used for optimistic concurrency. */
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
