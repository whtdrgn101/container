import { COLORS } from '@game-hub/engine/container';
import type { Action, Color, District, ShipLocation, StoredContainer } from '@game-hub/engine/container';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Container `Action`.
 *
 * This is the **only** validation `POST /games/:id/actions` does now. It used to be split: a Fastify
 * JSON-schema on the route enumerated all thirteen action types and checked the payload shapes, and
 * then a `parseAction` in `app.ts` re-checked the rest. That schema couldn't survive a second game —
 * the core route would have had to know every game's action types by name — so the route now takes
 * opaque JSON and hands it here. The shape checks the schema used to do live below; **don't drop
 * them assuming Fastify still runs first, because it doesn't.**
 *
 * Deliberately no stricter than the old schema + parser combined. It checks that a payload is
 * *structurally* an action and leaves every rules question (is that lot arrangement legal? can you
 * afford that bid?) to the engine, which answers with a proper `GameError` → 409. Tightening this
 * into a rules checker would put the rules in two places.
 */
export function parseContainerAction(raw: unknown): ParseResult<Action> {
  if (!isRecord(raw)) return bad('An action must be an object');
  const type = raw['type'];

  switch (type) {
    case 'PRODUCE': {
      const placements = optionalLots(raw['placements']);
      if (placements === INVALID) return bad('PRODUCE placements must be { color, price } objects');
      return ok(placements ? { type: 'PRODUCE', placements } : { type: 'PRODUCE' });
    }

    case 'BUILD_FACTORY': {
      const color = raw['color'];
      if (typeof color !== 'string' || !COLORS.includes(color as Color)) {
        return bad('BUILD_FACTORY requires a valid container color');
      }
      return ok({ type: 'BUILD_FACTORY', color: color as Color });
    }

    case 'BUILD_WAREHOUSE':
      return ok({ type: 'BUILD_WAREHOUSE' });

    case 'REPRICE': {
      const district = raw['district'];
      if (district !== 'factory' && district !== 'harbor') {
        return bad('REPRICE requires a district of "factory" or "harbor"');
      }
      const arrangement = optionalLots(raw['arrangement']);
      if (arrangement === INVALID) return bad('REPRICE arrangement must be { color, price } objects');
      return ok(
        arrangement
          ? { type: 'REPRICE', district: district as District, arrangement }
          : { type: 'REPRICE', district: district as District },
      );
    }

    case 'SAIL': {
      const to = raw['to'];
      if (!isRecord(to)) return bad('SAIL requires a destination');
      const kind = to['kind'];
      if (kind !== 'ocean' && kind !== 'harbor' && kind !== 'island' && kind !== 'bank') {
        return bad('SAIL requires a destination kind of ocean/harbor/island/bank');
      }
      if (kind === 'harbor') {
        const playerId = to['playerId'];
        if (typeof playerId !== 'string' || playerId.length === 0) {
          return bad('SAIL to a harbor requires a playerId');
        }
        return ok({ type: 'SAIL', to: { kind: 'harbor', playerId } });
      }
      return ok({ type: 'SAIL', to: { kind } as ShipLocation });
    }

    case 'FACTORY_PURCHASE': {
      const sellerId = raw['sellerId'];
      if (typeof sellerId !== 'string' || sellerId.length === 0) {
        return bad('FACTORY_PURCHASE requires a sellerId');
      }
      const bought = optionalLots(raw['bought']);
      if (bought === INVALID) return bad('FACTORY_PURCHASE bought must be { color, price } objects');
      return ok(bought ? { type: 'FACTORY_PURCHASE', sellerId, bought } : { type: 'FACTORY_PURCHASE', sellerId });
    }

    case 'HARBOR_PURCHASE': {
      const bought = optionalLots(raw['bought']);
      if (bought === INVALID) return bad('HARBOR_PURCHASE bought must be { color, price } objects');
      return ok(bought ? { type: 'HARBOR_PURCHASE', bought } : { type: 'HARBOR_PURCHASE' });
    }

    case 'DELIVER': {
      const bids = optionalBids(raw['bids']);
      if (bids === INVALID) return bad('DELIVER bids must be a map of playerId to number');
      const runoffBids = optionalBids(raw['runoffBids']);
      if (runoffBids === INVALID) return bad('DELIVER runoffBids must be a map of playerId to number');
      return ok({
        type: 'DELIVER',
        ...(bids ? { bids } : {}),
        ...(runoffBids ? { runoffBids } : {}),
        ...(raw['buyout'] ? { buyout: true } : {}),
      });
    }

    case 'REQUEST_LOAN':
      return ok({ type: 'REQUEST_LOAN' });

    case 'REPAY_LOAN':
      return ok({ type: 'REPAY_LOAN' });

    case 'CALL_BANK': {
      const lotIndex = raw['lotIndex'];
      if (typeof lotIndex !== 'number') return bad('CALL_BANK requires a lotIndex');
      const rawLotKind = raw['lotKind'];
      if (rawLotKind !== undefined && rawLotKind !== 'cash' && rawLotKind !== 'container') {
        return bad('CALL_BANK lotKind must be "container" or "cash"');
      }
      const bid = raw['bid'];
      if (bid !== undefined && typeof bid !== 'number') return bad('CALL_BANK bid must be a number');
      const containerBid = optionalLots(raw['containerBid']);
      if (containerBid === INVALID) return bad('CALL_BANK containerBid must be { color, price } objects');
      return ok({
        type: 'CALL_BANK',
        lotIndex,
        lotKind: rawLotKind === 'cash' ? 'cash' : 'container',
        ...(bid !== undefined ? { bid } : {}),
        ...(containerBid ? { containerBid } : {}),
      });
    }

    case 'LOAD_FROM_BANK':
      return ok({ type: 'LOAD_FROM_BANK' });

    case 'END_TURN':
      return ok({ type: 'END_TURN' });

    default:
      return bad(`Unknown action type "${String(type)}"`);
  }
}

const ok = (action: Action): ParseResult<Action> => ({ ok: true, action });
const bad = (message: string): ParseResult<Action> => ({ ok: false, message });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Distinguishes "absent" (undefined) from "present but malformed" (INVALID) without throwing. */
const INVALID = Symbol('invalid');

/**
 * An optional list of priced containers. Checks the `{ color, price }` shape the route's JSON-schema
 * used to check — but not that the color is real or the price legal: those are rules, and `deliver`,
 * `produce` and friends already reject them with a typed `GameError`.
 */
function optionalLots(value: unknown): StoredContainer[] | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return INVALID;
  const lots: StoredContainer[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['color'] !== 'string' || typeof item['price'] !== 'number') {
      return INVALID;
    }
    lots.push({ color: item['color'] as Color, price: item['price'] });
  }
  return lots;
}

/** An optional `{ playerId: amount }` map, as the schema's `additionalProperties: { type: number }` was. */
function optionalBids(value: unknown): Record<string, number> | undefined | typeof INVALID {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return INVALID;
  const bids: Record<string, number> = {};
  for (const [playerId, amount] of Object.entries(value)) {
    if (typeof amount !== 'number') return INVALID;
    bids[playerId] = amount;
  }
  return bids;
}
