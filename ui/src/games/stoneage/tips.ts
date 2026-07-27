import { HUNT_THRESHOLD, PLACE_RESOURCE, RESOURCE_THRESHOLD } from '@game-hub/engine/stoneage';
import type { BuildingCost, FixedPlaceId, Resource } from '@game-hub/engine/stoneage';

/**
 * Player-facing help text for Stone Age's action spots (the ActionTip / title content). Lives with the
 * game (the GameClient seam). Plain language: what a place does + its dice threshold or cost. Derived from
 * the engine constants where cheap so the numbers can't drift. Rulebook pages cited per entry (pp. 4–8).
 */

const RESOURCE_LABEL: Record<Resource, string> = { wood: 'wood', brick: 'brick', stone: 'stone', gold: 'gold' };

/** A board place's help — the hunt threshold, a resource site's die threshold, or the village actions (pg. 4–6). */
export function placeTip(place: FixedPlaceId): string {
  switch (place) {
    case 'hunt':
      // pg. 6 — the hunt: 1 food per full 2 pips of the dice + tools total.
      return `Hunt: place any number of people. Each rolls a die; every full ${HUNT_THRESHOLD} pips gathers 1 food.`;
    case 'toolMaker':
      // pg. 5 — the tool maker: 1 person, gain a tool (reusable each round).
      return 'Tool maker: place 1 person to make a tool. It boosts a future roll and refreshes each round. (1 space)';
    case 'hut':
      // pg. 5 — the hut ("love shack"): 2 of your people, gain 1 person.
      return 'Hut: place 2 of your people together to grow your tribe by 1 person. (2 spaces)';
    case 'field':
      // pg. 5 — the field: 1 person, +1 permanent food production.
      return 'Field: place 1 person to raise your food production by 1 each round. (1 space)';
    default: {
      // pg. 6 — a resource site: 1 die per person, 1 resource per full N pips.
      const resource = PLACE_RESOURCE[place];
      const threshold = RESOURCE_THRESHOLD[resource];
      const label = RESOURCE_LABEL[resource];
      return `Place people to gather ${label}. Each rolls a die; every full ${threshold} pips gathers 1 ${label}.`;
    }
  }
}

/** The gather roll (pg. 6): roll dice for the people you placed, add tools, then take the yield. */
export const GATHER_TIP = 'Roll a die for each person you placed here, optionally add tools, then take the resources.';

/** How a building tile is paid for (pg. 7), from its cost kind — points always equal the resources' value. */
export function buildTip(cost: BuildingCost): string {
  const base = 'Build this hut: score points equal to the value of the resources you pay.';
  if (cost.kind === 'choice') return `${base} Pay any ${cost.count} resources of ${cost.kinds} different kinds.`;
  if (cost.kind === 'any') return `${base} Pay any ${cost.min}–${cost.max} resources you like.`;
  return `${base} Pay exactly the resources shown.`;
}

/** Decline a building/card you placed a worker on (pg. 7): take nothing rather than pay. */
export const DECLINE_TIP = 'Pass: keep your resources and take nothing from this tile.';

/** Place a worker on a building slot in the placement phase (pg. 5, 7). */
export const PLACE_BUILDING_TIP = 'Place 1 person to claim this building tile; buy it in the action phase.';

/** Place a worker on a card slot in the placement phase (pg. 4, 6). */
export const PLACE_CARD_TIP = 'Place 1 person to claim this civilization card; take it in the action phase.';

/** Take a civilization card (pg. 6): pay its position cost in any resources; effect now, scoring at end. */
export const ACQUIRE_CARD_TIP =
  'Take this card: pay its cost in any resources (never food). Its instant effect fires now, and it scores at game end.';

/** Feed your people (pg. 7): 1 food each; cover a shortfall with resources or take the −10 penalty. */
export const FEED_TIP = 'Feed your people: 1 food each. Food production covers some; pay any shortfall in resources.';
export const FEED_PENALTY_TIP = 'Go hungry: skip feeding this round for a −10 point penalty.';

/** Add a tool to the pending roll (pg. 6): each tool is usable once per round. */
export const TOOL_TIP = 'Add this tool to your roll (+its value). Each tool can be used once per round.';

/** Take the rolled yield (pg. 6), including any tools added. */
export const TAKE_GATHER_TIP = 'Take the resources from this roll (including any tools you added).';
