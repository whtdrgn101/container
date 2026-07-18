import type { MoveRecord } from '../../../kernel';

// The append-only move-log entry is a kernel primitive; re-exported so Stone Age's modules import it
// from `../core` alongside the domain types.
export type { MoveRecord } from '../../../kernel';

/** The four gatherable resources. */
export type Resource = 'wood' | 'brick' | 'stone' | 'gold';

/** The eight fixed board places people can be placed on (pg. 4). */
export type FixedPlaceId = 'toolMaker' | 'hut' | 'field' | 'hunt' | 'forest' | 'clayPit' | 'quarry' | 'river';

/**
 * A building slot (pg. 5): one per building stack on the board, holding exactly 1 person. There are up
 * to 4 stacks (only `playerCount` are in play); slots for stacks that don't exist stay empty.
 */
export type BuildingPlaceId = 'building1' | 'building2' | 'building3' | 'building4';

/** Anywhere a person can be placed — the fixed board places plus the building slots (SA9). */
export type PlaceId = FixedPlaceId | BuildingPlaceId;

/** The four places you gather a resource from (all resolved by a dice roll). */
export type ResourcePlaceId = 'forest' | 'clayPit' | 'quarry' | 'river';

/** A place resolved by rolling dice: the four resource places + the hunt (which pays food). */
export type GatherPlaceId = ResourcePlaceId | 'hunt';

/** A round's three phases, in order (pg. 4): place people, use their actions, feed everyone. */
export type Phase = 'placement' | 'actions' | 'feeding';

/**
 * What a building tile costs, and so how many points it scores (pg. 7 — score = value of resources
 * paid). Three kinds:
 *  - `fixed`  — pay exactly the resources shown; points = their combined value.
 *  - `choice` — pay exactly `count` resources from exactly `kinds` different kinds (you pick which).
 *  - `any`    — pay `min`..`max` resources of any kinds you like.
 */
export type BuildingCost =
  | { readonly kind: 'fixed'; readonly resources: Readonly<Partial<Record<Resource, number>>> }
  | { readonly kind: 'choice'; readonly count: number; readonly kinds: number }
  | { readonly kind: 'any'; readonly min: number; readonly max: number };

/** One building tile: an id (for logs/keys) and its cost/scoring rule. */
export interface Building {
  readonly id: string;
  readonly cost: BuildingCost;
}

/**
 * A dice roll awaiting resolution (pg. 5–6): the active player has rolled at a gather place and may now
 * add tools before taking the yield. Held on the state so the dice stay server-authoritative between the
 * roll and the take. Belongs to the active player.
 */
export interface PendingGather {
  readonly place: GatherPlaceId;
  readonly dice: readonly number[];
}

/** One player's board (pg. 2). */
export interface StoneAgePlayer {
  readonly id: string;
  readonly name: string;
  /** People figures owned (grows via the hut). Starts at `STARTING_PEOPLE`. */
  readonly people: number;
  /** Food in hand. Starts at `STARTING_FOOD`; spent feeding, gained from the food track + hunting. */
  readonly food: number;
  /** Position on the food track = food produced each round (via the field). Starts at 0. */
  readonly foodTrack: number;
  /** Tool tiles by value, e.g. `[1, 2]` — each adds to one dice roll per round (pg. 5). Starts empty. */
  readonly tools: readonly number[];
  /**
   * Which tools have been spent this round (parallel to `tools`; each tool is once-per-round, pg. 5).
   * All reset to unused at round start. Empty until the first tool is acquired.
   */
  readonly toolsUsed: readonly boolean[];
  /** Gathered resources on the player board. All start at 0. */
  readonly resources: Readonly<Record<Resource, number>>;
  /** Acquired civilization-card ids, kept face down for final scoring (pg. 6). */
  readonly civCards: readonly string[];
  /** Number of buildings acquired (they score immediately onto the track; kept for the hut-builder card). */
  readonly buildings: number;
  /** Position on the scoring track. Starts at 0. */
  readonly score: number;
}

/**
 * The complete, serializable state of a Stone Age game — the **bootstrap scaffold** (roadmap SA0).
 *
 * Everything a round needs to *render* is here; the game is intentionally inert until each action
 * lands in its own stage. Fields that only later stages need (building/card decks, dice awaiting a
 * roll, per-place tool spend) are added when those stages arrive — the state grows one slice at a time,
 * exactly as Container's did.
 */
export interface StoneAgeState {
  readonly id: string;
  readonly players: readonly StoneAgePlayer[];
  /** Round counter (starts at 1). */
  readonly round: number;
  readonly phase: Phase;
  /** Index into `players` of the start player (rotates left each round, pg. 7). */
  readonly startPlayerIndex: number;
  /** Whose turn it is within the current phase. */
  readonly activePlayerIndex: number;
  /**
   * People placed on each place this round, as `playerId → count`. Empty between rounds. Capacities
   * live in `PLACE_CAPACITY`; the placement rules (one place per turn, once-per-place-per-round) are
   * the placement stage's job.
   */
  readonly placements: Readonly<Record<PlaceId, Readonly<Record<string, number>>>>;
  /**
   * The building stacks on the board (pg. 5, 7), one per player (`playerCount` of them). Each stack's
   * first tile is the revealed top you can place on and buy; taking it reveals the next. An emptied
   * stack is a game-end trigger (wired in SA11).
   */
  readonly buildings: readonly (readonly Building[])[];
  /**
   * A dice roll the active player has made and not yet taken (pg. 5–6) — set by the server-only roll,
   * cleared when they take it (optionally adding tools). `null` the rest of the time; while set, the
   * turn is locked to finishing it.
   */
  readonly pendingGather: PendingGather | null;
  readonly status: 'active' | 'ended';
  /** Winner(s) once scored — empty until the game ends. */
  readonly winnerIds: readonly string[];
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
