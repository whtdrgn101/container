import type { MoveRecord } from '../../../kernel';

// The append-only move-log entry is a kernel primitive; re-exported so Stone Age's modules import it
// from `../core` alongside the domain types.
export type { MoveRecord } from '../../../kernel';

/** The four gatherable resources. */
export type Resource = 'wood' | 'brick' | 'stone' | 'gold';

/** The eight board places people can be placed on (pg. 4). */
export type PlaceId = 'toolMaker' | 'hut' | 'field' | 'hunt' | 'forest' | 'clayPit' | 'quarry' | 'river';

/** A round's three phases, in order (pg. 4): place people, use their actions, feed everyone. */
export type Phase = 'placement' | 'actions' | 'feeding';

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
  readonly status: 'active' | 'ended';
  /** Winner(s) once scored — empty until the game ends. */
  readonly winnerIds: readonly string[];
  readonly version: number;
  readonly log: readonly MoveRecord[];
}
