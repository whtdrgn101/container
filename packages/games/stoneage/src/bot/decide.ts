import {
  ALL_PLACES,
  buildingIndex,
  cardIndex,
  isBuildingPlace,
  isCardPlace,
  isGatherPlace,
  isUsePlace,
} from '../engine';
import type { Action, FixedPlaceId, PlaceId, StoneAgeView } from '../engine';
import { BotError, assertBotTurn } from '@game-hub/kernel/bot';
import { buildingPaymentFor, cardPaymentFor, chooseTools, foodDeficit, pickPlacement } from './policy';
import type { DecideOptions } from './types';

/**
 * Choose this bot's next Stone Age action.
 *
 * `view` is `viewFor(state, playerId)` — Stone Age hides almost nothing, so the view is essentially the
 * whole state. The returned action is always legal for `applyAction`, one per phase:
 * - **placement** → the best `PLACE` (there is always the hunt, so it never stalls).
 * - **feeding** → `FEED`, covering any shortfall with resources rather than eating the −10 when it can.
 * - **actions** → resolve one placed worker: take a pending roll (`TAKE_GATHER`), else roll a gather
 *   (`GATHER`, dice from `options.rollDice`), else `USE`, else buy/decline a building or card. Gathers go
 *   first so the resources are in hand before buying.
 */
export function decide(view: StoneAgeView, playerId: string, options: DecideOptions = {}): Action {
  const active = assertBotTurn(view, playerId);

  if (view.phase === 'placement') {
    return { type: 'PLACE', ...pickPlacement(view, playerId) };
  }

  if (view.phase === 'feeding') {
    return { type: 'FEED', payWithResources: true };
  }

  // Action phase. A pending roll locks the turn to taking it.
  if (view.pendingGather) {
    return { type: 'TAKE_GATHER', toolIndices: chooseTools(view) };
  }

  const mine = ALL_PLACES.filter((place) => view.placements[place]?.[playerId] !== undefined);

  // 1. Gathers first (resources in hand before buying). Hunt first when short on food.
  const gathers = mine.filter(isGatherPlace);
  if (gathers.length > 0) {
    const place = pickGather(gathers, foodDeficit(active));
    if (!options.rollDice) {
      throw new BotError(
        `Bot seat "${playerId}" chose to gather "${place}", but no rollDice was supplied. Dice are ` +
          'randomness the bot cannot invent — the caller must inject them (self-play seeds an rng; the runner uses ctx.rng).',
      );
    }
    return { type: 'GATHER', place, dice: options.rollDice(view.placements[place]![playerId]!) };
  }

  // 2. The non-dice places (tool maker / hut / field).
  const use = mine.find(isUsePlace);
  if (use) return { type: 'USE', place: use };

  // 3. Buildings — buy if affordable, else take the worker back (empty payment).
  const buildPlace = mine.find(isBuildingPlace);
  if (buildPlace) {
    const stack = buildingIndex(buildPlace);
    const building = view.buildings[stack]?.[0];
    const pay = building ? buildingPaymentFor(building, active) : null;
    return { type: 'BUILD', stack, resources: pay ?? {} };
  }

  // 4. Civilization cards — same: acquire if affordable, else decline.
  const cardPlace = mine.find(isCardPlace);
  if (cardPlace) {
    const slot = cardIndex(cardPlace);
    return { type: 'ACQUIRE_CARD', slot, resources: cardPaymentFor(slot, active) ?? {} };
  }

  throw new BotError(`Bot seat "${playerId}" has no worker to resolve in the action phase`);
}

/** The scoring value of each resource place's resource (gold richest), for ordering gathers. */
const PLACE_VALUE: Record<string, number> = { forest: 3, clayPit: 4, quarry: 5, river: 6 };

/** Choose which gather to resolve: the hunt first when short on food, otherwise the richest resource. */
function pickGather(gathers: PlaceId[], deficit: number): FixedPlaceId {
  const places = gathers as FixedPlaceId[];
  if (deficit > 0 && places.includes('hunt')) return 'hunt';
  const resources = places.filter((p) => p !== 'hunt');
  if (resources.length === 0) return 'hunt';
  return resources.reduce((best, p) => ((PLACE_VALUE[p] ?? 0) > (PLACE_VALUE[best] ?? 0) ? p : best));
}
