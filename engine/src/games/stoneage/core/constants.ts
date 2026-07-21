// Rulebook-sourced constants for Stone Age (reference_materials/Stone_Age_-_Rules_-_Bernd_Brunnhofer.pdf).
// This is the bootstrap scaffold (roadmap SA0); the mechanics land one action per stage.

import type { Building, BuildingPlaceId, CardPlaceId, CivCard, FixedPlaceId, Resource } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** The four gatherable resources, in board order (with their die threshold + scoring value). */
export const RESOURCES: readonly Resource[] = ['wood', 'brick', 'stone', 'gold'];

/** Setup (rulebook pg. 2): each player starts with 5 people and 12 food. */
export const STARTING_PEOPLE = 5;
export const STARTING_FOOD = 12;

/**
 * Population cap (pg. 2): 40 people figures ÷ 4 colors — 5 start on the player board (step 11) and 5
 * sit in the general supply (step 12). The hut takes "from the general supply" (pg. 6), so once your
 * color's supply is empty there is nothing left to gain. Placing on the hut stays legal at the cap
 * (nothing in the rules forbids it — it's a legitimate blocking move); the *gain* is what stops,
 * like the 13th tool.
 */
export const MAX_PEOPLE = 10;

/** Food-track cap (pg. 2): the track printed on the board runs 0–10 (setup step 10). Same clamp rule. */
export const MAX_FOOD_TRACK = 10;

/**
 * The die pip you need "a full N of" to gather a resource, and each resource's scoring value —
 * wood is commonest (full 3s) and cheapest, gold rarest (full 6s) and dearest (pg. 6).
 */
export const RESOURCE_THRESHOLD: Readonly<Record<Resource, number>> = { wood: 3, brick: 4, stone: 5, gold: 6 };
export const RESOURCE_VALUE: Readonly<Record<Resource, number>> = { wood: 3, brick: 4, stone: 5, gold: 6 };
/** The hunt pays 1 food per "full 2" of the dice+tools total (pg. 6). */
export const HUNT_THRESHOLD = 2;

/** Stone Age rolls six-sided dice — one per person on a place (pg. 6). */
export const DIE_FACES = 6;

/** The four places you gather resources from (all use the roll-dice engine). */
export const RESOURCE_PLACES = ['forest', 'clayPit', 'quarry', 'river'] as const;

/** The eight fixed places people can be placed (pg. 4). Building slots are separate (`BUILDING_PLACES`). */
export const PLACES: readonly FixedPlaceId[] = [
  'toolMaker',
  'hut',
  'field',
  'hunt',
  'forest',
  'clayPit',
  'quarry',
  'river',
];

/** The building slots (pg. 5), one per stack — only the first `playerCount` are ever in play. */
export const BUILDING_PLACES: readonly BuildingPlaceId[] = ['building1', 'building2', 'building3', 'building4'];

/** The civilization-card slots (pg. 4), one per display space (SA10). */
export const CARD_PLACES: readonly CardPlaceId[] = ['card1', 'card2', 'card3', 'card4'];

/** Every place people can be placed — fixed board places + building slots + card slots. */
export const ALL_PLACES: readonly (FixedPlaceId | BuildingPlaceId | CardPlaceId)[] = [...PLACES, ...BUILDING_PLACES, ...CARD_PLACES];

/** What each card slot costs, by position (pg. 6): the leftmost is cheapest; a card gets cheaper as it ages left. */
export const CARD_COST: readonly number[] = [1, 2, 3, 4];

/** Which resource each of the four gathering places yields. */
export const PLACE_RESOURCE: Readonly<Record<'forest' | 'clayPit' | 'quarry' | 'river', Resource>> = {
  forest: 'wood',
  clayPit: 'brick',
  quarry: 'stone',
  river: 'gold',
};

/**
 * How many people a place holds (pg. 4). `toolMaker`/`field` take exactly 1, `hut` exactly 2 (same
 * player), the four resource places up to 7 total, and `hunt` is unbounded (once per player per round).
 */
export const PLACE_CAPACITY: Readonly<Record<FixedPlaceId, number | null>> = {
  toolMaker: 1,
  hut: 2,
  field: 1,
  hunt: null, // no limit
  forest: 7,
  clayPit: 7,
  quarry: 7,
  river: 7,
};

/** Buildings come in up to 4 face-down stacks of 7 (pg. 3, setup step 9 — `playerCount` stacks in play). */
export const BUILDING_STACK_SIZE = 7;
export const MAX_BUILDING_STACKS = 4;

/**
 * The building tiles (pg. 7). The rulebook prints 28 tiles but doesn't enumerate every fixed cost, so
 * this is a faithful *adaptation* — the same shape as the physical deck (17 fixed-cost + 8 "exactly 4
 * from 2 kinds" + 3 "1–7 any"), the same discipline as Container defining its own scoring-card deck.
 * Shuffled at `createGame` and dealt into stacks. Points always equal the value of the resources paid.
 */
export const BUILDING_DECK: readonly Building[] = [
  { id: 'b01', cost: { kind: 'fixed', resources: { wood: 2, brick: 1 } } },
  { id: 'b02', cost: { kind: 'fixed', resources: { wood: 1, brick: 1, stone: 1 } } },
  { id: 'b03', cost: { kind: 'fixed', resources: { brick: 2, stone: 1 } } },
  { id: 'b04', cost: { kind: 'fixed', resources: { wood: 1, stone: 2 } } },
  { id: 'b05', cost: { kind: 'fixed', resources: { brick: 1, gold: 1 } } },
  { id: 'b06', cost: { kind: 'fixed', resources: { wood: 2, brick: 2 } } },
  { id: 'b07', cost: { kind: 'fixed', resources: { stone: 1, gold: 1 } } },
  { id: 'b08', cost: { kind: 'fixed', resources: { wood: 3, stone: 1 } } },
  { id: 'b09', cost: { kind: 'fixed', resources: { wood: 1, gold: 1 } } },
  { id: 'b10', cost: { kind: 'fixed', resources: { brick: 1, stone: 2 } } },
  { id: 'b11', cost: { kind: 'fixed', resources: { wood: 1, brick: 1, gold: 1 } } },
  { id: 'b12', cost: { kind: 'fixed', resources: { brick: 2, gold: 1 } } },
  { id: 'b13', cost: { kind: 'fixed', resources: { wood: 1, stone: 1, gold: 1 } } },
  { id: 'b14', cost: { kind: 'fixed', resources: { wood: 2, gold: 1 } } },
  { id: 'b15', cost: { kind: 'fixed', resources: { brick: 1, stone: 1 } } },
  { id: 'b16', cost: { kind: 'fixed', resources: { wood: 3, brick: 1 } } },
  { id: 'b17', cost: { kind: 'fixed', resources: { stone: 2, gold: 1 } } },
  { id: 'c01', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c02', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c03', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c04', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c05', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c06', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c07', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'c08', cost: { kind: 'choice', count: 4, kinds: 2 } },
  { id: 'a01', cost: { kind: 'any', min: 1, max: 7 } },
  { id: 'a02', cost: { kind: 'any', min: 1, max: 7 } },
  { id: 'a03', cost: { kind: 'any', min: 1, max: 7 } },
];

/** The card display always shows 4 civilization cards (pg. 3, setup step 8). */
export const CIV_CARD_SLOTS = 4;

/** The eight green "culture" symbols — final scoring counts a player's *distinct* symbols, squared (pg. 8). */
export const CARD_SYMBOLS = ['writing', 'pottery', 'art', 'music', 'medicine', 'weaving', 'transport', 'timekeeping'] as const;

/**
 * The 36-card civilization deck (pg. 6 + info sheet). The rulebook points to a separate info sheet for
 * the exact cards, so — like `BUILDING_DECK` — this is a faithful **adaptation**: 24 green culture cards
 * (three per symbol) each with an instant benefit, and 12 sand-coloured multiplier cards (three each of
 * farmer / tool maker / hut builder / shaman). SA10a applies the `effect` on acquisition; SA11 scores by
 * `scoring`. The roll-and-share and choose-later card types are deferred.
 */
export const CIV_CARD_DECK: readonly CivCard[] = [
  // Green culture cards — { symbol, immediate effect }.
  { id: 'cv01', scoring: { kind: 'green', symbol: 'writing' }, effect: { kind: 'tool' } },
  { id: 'cv02', scoring: { kind: 'green', symbol: 'writing' }, effect: { kind: 'points', amount: 3 } },
  { id: 'cv03', scoring: { kind: 'green', symbol: 'writing' }, effect: { kind: 'resource', resource: 'wood', amount: 2 } },
  { id: 'cv04', scoring: { kind: 'green', symbol: 'pottery' }, effect: { kind: 'food', amount: 2 } },
  { id: 'cv05', scoring: { kind: 'green', symbol: 'pottery' }, effect: { kind: 'foodTrack', amount: 1 } },
  { id: 'cv06', scoring: { kind: 'green', symbol: 'pottery' }, effect: { kind: 'resource', resource: 'brick', amount: 2 } },
  { id: 'cv07', scoring: { kind: 'green', symbol: 'art' }, effect: { kind: 'points', amount: 4 } },
  { id: 'cv08', scoring: { kind: 'green', symbol: 'art' }, effect: { kind: 'resource', resource: 'stone', amount: 1 } },
  { id: 'cv09', scoring: { kind: 'green', symbol: 'art' }, effect: { kind: 'tool' } },
  { id: 'cv10', scoring: { kind: 'green', symbol: 'music' }, effect: { kind: 'food', amount: 3 } },
  { id: 'cv11', scoring: { kind: 'green', symbol: 'music' }, effect: { kind: 'resource', resource: 'gold', amount: 1 } },
  { id: 'cv12', scoring: { kind: 'green', symbol: 'music' }, effect: { kind: 'foodTrack', amount: 1 } },
  { id: 'cv13', scoring: { kind: 'green', symbol: 'medicine' }, effect: { kind: 'resource', resource: 'wood', amount: 1 } },
  { id: 'cv14', scoring: { kind: 'green', symbol: 'medicine' }, effect: { kind: 'points', amount: 3 } },
  { id: 'cv15', scoring: { kind: 'green', symbol: 'medicine' }, effect: { kind: 'food', amount: 2 } },
  { id: 'cv16', scoring: { kind: 'green', symbol: 'weaving' }, effect: { kind: 'tool' } },
  { id: 'cv17', scoring: { kind: 'green', symbol: 'weaving' }, effect: { kind: 'resource', resource: 'brick', amount: 1 } },
  { id: 'cv18', scoring: { kind: 'green', symbol: 'weaving' }, effect: { kind: 'points', amount: 4 } },
  { id: 'cv19', scoring: { kind: 'green', symbol: 'transport' }, effect: { kind: 'foodTrack', amount: 1 } },
  { id: 'cv20', scoring: { kind: 'green', symbol: 'transport' }, effect: { kind: 'resource', resource: 'stone', amount: 2 } },
  { id: 'cv21', scoring: { kind: 'green', symbol: 'transport' }, effect: { kind: 'food', amount: 2 } },
  { id: 'cv22', scoring: { kind: 'green', symbol: 'timekeeping' }, effect: { kind: 'resource', resource: 'gold', amount: 1 } },
  { id: 'cv23', scoring: { kind: 'green', symbol: 'timekeeping' }, effect: { kind: 'tool' } },
  { id: 'cv24', scoring: { kind: 'green', symbol: 'timekeeping' }, effect: { kind: 'points', amount: 3 } },
  // Sand-coloured multiplier cards — { multiplier, small immediate effect }.
  { id: 'cv25', scoring: { kind: 'farmer' }, effect: { kind: 'none' } },
  { id: 'cv26', scoring: { kind: 'farmer' }, effect: { kind: 'food', amount: 2 } },
  { id: 'cv27', scoring: { kind: 'farmer' }, effect: { kind: 'foodTrack', amount: 1 } },
  { id: 'cv28', scoring: { kind: 'toolMaker' }, effect: { kind: 'tool' } },
  { id: 'cv29', scoring: { kind: 'toolMaker' }, effect: { kind: 'none' } },
  { id: 'cv30', scoring: { kind: 'toolMaker' }, effect: { kind: 'resource', resource: 'wood', amount: 1 } },
  { id: 'cv31', scoring: { kind: 'builder' }, effect: { kind: 'resource', resource: 'brick', amount: 1 } },
  { id: 'cv32', scoring: { kind: 'builder' }, effect: { kind: 'none' } },
  { id: 'cv33', scoring: { kind: 'builder' }, effect: { kind: 'resource', resource: 'stone', amount: 1 } },
  { id: 'cv34', scoring: { kind: 'shaman' }, effect: { kind: 'food', amount: 2 } },
  { id: 'cv35', scoring: { kind: 'shaman' }, effect: { kind: 'none' } },
  { id: 'cv36', scoring: { kind: 'shaman' }, effect: { kind: 'points', amount: 3 } },
];

/** Feeding shortfall you can't cover costs 10 points off the scoring track (pg. 7). */
export const STARVATION_PENALTY = 10;
