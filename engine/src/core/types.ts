import type { Color } from './colors';

/** A built factory. Each factory produces one container of its color per Produce action. */
export interface Factory {
  readonly id: string;
  readonly color: Color;
}

/** A container in a storage lot: its color and the lot price it currently sits in (its sale price). */
export interface StoredContainer {
  readonly color: Color;
  readonly price: number;
}

/** The two storage districts on a player board. */
export type District = 'factory' | 'harbor';

/**
 * A player's secret final scoring card (rulebook pg. 18). Assigns a base cash value to each container
 * color in your Container Island scoring area. One color is the "two-value" color: worth $10 at game
 * end if you collected at least one of every color, otherwise its base value ($5).
 */
export interface ScoringCard {
  readonly id: string;
  readonly values: Readonly<Record<Color, number>>;
  readonly twoValueColor: Color;
}

/**
 * Where a player's ship is. A ship is in the ocean, docked at an opponent's harbor, or at one of
 * the two central boards (Container Island / Off-Shore Bank). It can never enter its own harbor.
 */
export type ShipLocation =
  | { readonly kind: 'ocean' }
  | { readonly kind: 'harbor'; readonly playerId: string }
  | { readonly kind: 'island' }
  | { readonly kind: 'bank' };

/** A player's ship: where it is and what it's carrying (up to SHIP_CAPACITY containers). */
export interface ShipState {
  readonly location: ShipLocation;
  /** Containers loaded for delivery (loaded via Harbor Purchase in Slice 4; empty for now). */
  readonly cargo: readonly Color[];
}

/**
 * A single player's board state.
 *
 * Both districts store containers as priced lots (`StoredContainer[]`). The factory district is
 * populated by Produce; the harbor district is filled by Factory Purchase (Slice 4) and is empty
 * for now. The ship, scoring card, loans, etc. arrive in later slices.
 */
export interface PlayerState {
  readonly id: string;
  readonly name: string;
  /** Cash in hand. */
  readonly money: number;
  /** Built factories. Max 4, each a distinct color. */
  readonly factories: readonly Factory[];
  /** Containers awaiting sale in the factory district, each priced by its lot. */
  readonly factoryStore: readonly StoredContainer[];
  /** Max containers storable in the factory district (2 per built factory). */
  readonly factoryLimit: number;
  /** Containers awaiting sale in the harbor district, each priced by its lot. */
  readonly harborStore: readonly StoredContainer[];
  /** Number of built warehouses (starts at 1, max 5). */
  readonly warehouses: number;
  /** Max containers storable in the harbor district (1 per built warehouse). */
  readonly harborLimit: number;
  /** The player's ship (starts in the ocean, empty). */
  readonly ship: ShipState;
  /** Containers won at delivery auctions, on Container Island — scored at game end. */
  readonly scoringArea: readonly Color[];
  /** This player's secret final scoring card (dealt at setup). */
  readonly scoringCard: ScoringCard;
  /** Outstanding Off-Shore Bank loans (0–2). Each costs $1 interest at the start of your turn. */
  readonly loans: number;
  /** Containers won in Bank auctions, waiting at the Bank to be picked up by your ship. */
  readonly holdingArea: readonly Color[];
}

/**
 * An active Off-Shore Bank auction (rulebook pg. 12–14). `bid` is a cash amount for a container lot
 * (you bid cash to win containers) or a container count for a cash lot (deferred to Slice 6c).
 */
export interface BankAuction {
  readonly lotKind: 'container' | 'cash';
  readonly lotIndex: number;
  readonly highBidderId: string;
  /** Cash amount for a container lot; number of containers for a cash lot. */
  readonly bid: number;
  /** Containers a cash-lot bidder has committed (returned on outbid); empty for container lots. */
  readonly reserved: readonly StoredContainer[];
}

/** The Off-Shore Bank board: 3 cash lots (I/II/III), 3 container lots, auction tokens, live auctions. */
export interface BankState {
  readonly cashLots: readonly number[];
  readonly containerLots: readonly (readonly Color[])[];
  readonly tokens: number;
  readonly auctions: readonly BankAuction[];
}

/** Shared components still available (drawn down as players produce / build). */
export interface Supply {
  /** Containers still available, per color. Produce draws from here; the game ends when 2 colors hit 0. */
  readonly containers: Readonly<Record<Color, number>>;
  /** Factory buildings still available, per color. */
  readonly factories: Readonly<Record<Color, number>>;
  /** Warehouse buildings still available. */
  readonly warehouses: number;
}

/** A player's final-scoring breakdown (rulebook pg. 18). `total` decides the winner. */
export interface PlayerScore {
  readonly playerId: string;
  /** Cash in hand at game end. */
  readonly cash: number;
  /** Value of the scoring area by the player's card, after discarding their most-common color. */
  readonly islandScore: number;
  /** $3 per container on ship + in holding, $2 per harbor container, $0 per factory container. */
  readonly leftover: number;
  /** $11 per outstanding loan, subtracted. */
  readonly loanPenalty: number;
  readonly total: number;
  /** The color discarded from the scoring area (null if the scoring area was empty). */
  readonly discardedColor: Color | null;
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
  /** The Off-Shore Bank board. */
  readonly bank: BankState;
  /** Whether the game is still in progress or has ended (supply of 2 colors exhausted). */
  readonly status: 'active' | 'ended';
  /** Final-scoring breakdown per player; empty until the game ends. */
  readonly results: readonly PlayerScore[];
  /** Winner(s) — more than one on a shared victory; empty until the game ends. */
  readonly winnerIds: readonly string[];
  /** Monotonic version, incremented once per applied action. Used for optimistic concurrency. */
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
