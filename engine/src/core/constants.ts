/**
 * Numeric game constants, all sourced from the rulebook. Kept in one place so tuning/verifying
 * values is a single-file change and no magic numbers leak into the mechanics.
 */

/** Starting cash: five $1s, five $2s, one $5 (rulebook setup step 12). */
export const STARTING_MONEY = 20;

/** A Produce action always costs $1 in union wages, regardless of how many containers are produced. */
export const UNION_WAGE = 1;

/** Each built factory adds 2 to the factory-district storage limit (rulebook, pg. 5). */
export const FACTORY_STORAGE_PER_FACTORY = 2;

/** Each built warehouse adds 1 to the harbor-district storage limit (rulebook, pg. 5). */
export const WAREHOUSE_STORAGE_PER_WAREHOUSE = 1;

/** Actions a player may take per turn (rulebook, pg. 6). */
export const ACTIONS_PER_TURN = 2;

/** Building caps per player (rulebook, pg. 5): 4 factories total, 5 warehouses total. */
export const MAX_FACTORIES = 4;
export const MAX_WAREHOUSES = 5;

/** Max containers a ship can carry — fixed, cannot be increased (rulebook, pg. 9). */
export const SHIP_CAPACITY = 5;

/** Supported player counts (rulebook: 3–5 players). */
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;

/** Valid storage-lot (sale) prices for each district, from the rulebook player board. */
export const FACTORY_LOT_PRICES = [1, 2, 3, 4, 5, 6] as const;
export const HARBOR_LOT_PRICES = [2, 3, 4, 5, 6, 7] as const;

/** Default lot for freshly produced containers when the player doesn't specify one (the $2 lot). */
export const DEFAULT_FACTORY_LOT = 2;

/** Default harbor lot for containers bought via Factory Purchase (buyer reprices afterward). */
export const DEFAULT_HARBOR_LOT = 2;

/**
 * Cost to build the next factory, indexed by how many factories you already have (the first is FREE).
 * From the rulebook player board: $4 and $12 are legible; $8 is the middle space (obscured by a
 * building on the art) and follows the +$4 progression. Verify against the physical board.
 */
export const FACTORY_BUILD_COSTS = [4, 8, 12] as const;

/**
 * Cost to build the next warehouse, indexed by how many warehouses you already have (the first is FREE).
 * TODO(verify): the warehouse track is obscured by buildings on the rulebook art; confirm these
 * against the physical board. Kept as a single named constant so correcting it is trivial.
 */
export const WAREHOUSE_BUILD_COSTS = [3, 6, 9, 12] as const;

/** Factory buildings available per color, by player count (rulebook setup table). Internal. */
export const FACTORY_SUPPLY_PER_COLOR: Readonly<Record<number, number>> = { 3: 2, 4: 3, 5: 4 };

/** Warehouse buildings available total, by player count (rulebook setup table). Internal. */
export const WAREHOUSE_SUPPLY_TOTAL: Readonly<Record<number, number>> = { 3: 12, 4: 16, 5: 20 };
