// Rulebook-sourced constants for Stone Age (reference_materials/Stone_Age_-_Rules_-_Bernd_Brunnhofer.pdf).
// This is the bootstrap scaffold (roadmap SA0); the mechanics land one action per stage.

import type { PlaceId, Resource } from './types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** The four gatherable resources, in board order (with their die threshold + scoring value). */
export const RESOURCES: readonly Resource[] = ['wood', 'brick', 'stone', 'gold'];

/** Setup (rulebook pg. 2): each player starts with 5 people and 12 food. */
export const STARTING_PEOPLE = 5;
export const STARTING_FOOD = 12;

/**
 * The die pip you need "a full N of" to gather a resource, and each resource's scoring value —
 * wood is commonest (full 3s) and cheapest, gold rarest (full 6s) and dearest (pg. 6).
 */
export const RESOURCE_THRESHOLD: Readonly<Record<Resource, number>> = { wood: 3, brick: 4, stone: 5, gold: 6 };
export const RESOURCE_VALUE: Readonly<Record<Resource, number>> = { wood: 3, brick: 4, stone: 5, gold: 6 };
/** The hunt pays 1 food per "full 2" of the dice+tools total (pg. 6). */
export const HUNT_THRESHOLD = 2;

/** The eight places people can be placed (pg. 4). */
export const PLACES: readonly PlaceId[] = [
  'toolMaker',
  'hut',
  'field',
  'hunt',
  'forest',
  'clayPit',
  'quarry',
  'river',
];

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
export const PLACE_CAPACITY: Readonly<Record<PlaceId, number | null>> = {
  toolMaker: 1,
  hut: 2,
  field: 1,
  hunt: null, // no limit
  forest: 7,
  clayPit: 7,
  quarry: 7,
  river: 7,
};

/** Buildings come in `playerCount` face-down stacks of 7 (pg. 3, setup step 9). */
export const BUILDING_STACK_SIZE = 7;

/** The card display always shows 4 civilization cards (pg. 3, setup step 8). */
export const CIV_CARD_SLOTS = 4;

/** Feeding shortfall you can't cover costs 10 points off the scoring track (pg. 7). */
export const STARVATION_PENALTY = 10;
