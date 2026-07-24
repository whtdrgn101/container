import { ALL_PLACES, RESOURCES } from '@game-hub/engine/stoneage';
import type { Action, PlaceId, Resource } from '@game-hub/engine/stoneage';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Stone Age `Action`: `PLACE` (SA1), `USE` (SA4–6), `FEED` (SA7),
 * `BUILD` (SA9), `ACQUIRE_CARD` (SA10) and `TAKE_GATHER` (SA4b). `GATHER` (the roll) is server-only.
 * Structural checks only — the engine judges legality (whose turn, which place is full/wrong-kind, a
 * payment that fits the tile/card) and answers with a `GameError`.
 */
export function parseStoneAgeAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) return bad('An action must be an object');
  const record = raw as Record<string, unknown>;

  const place = record['place'];
  // Any place people can go: the 8 fixed board places + the building slots (SA9). The engine still
  // judges which action a given place actually supports (a building isn't a USE place, etc.).
  const validPlace = typeof place === 'string' && ALL_PLACES.includes(place as PlaceId);

  switch (record['type']) {
    case 'PLACE': {
      if (!validPlace) return bad('PLACE requires a valid board place');
      const count = record['count'];
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        return bad('PLACE requires a positive whole-number count');
      }
      return { ok: true, action: { type: 'PLACE', place: place as PlaceId, count } };
    }
    case 'USE': {
      if (!validPlace) return bad('USE requires a valid board place');
      return { ok: true, action: { type: 'USE', place: place as PlaceId } };
    }
    case 'FEED': {
      const pay = record['payWithResources'];
      if (pay !== undefined && typeof pay !== 'boolean') return bad('FEED payWithResources must be a boolean');
      return { ok: true, action: { type: 'FEED', payWithResources: pay } };
    }
    case 'BUILD': {
      const stack = record['stack'];
      if (typeof stack !== 'number' || !Number.isInteger(stack) || stack < 0)
        return bad('BUILD requires a stack index');
      const rawResources = record['resources'];
      if (typeof rawResources !== 'object' || rawResources === null) return bad('BUILD requires a resources payment');
      const src = rawResources as Record<string, unknown>;
      const resources: Partial<Record<Resource, number>> = {};
      for (const r of RESOURCES) {
        const n = src[r];
        if (n === undefined) continue;
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
          return bad(`BUILD ${r} must be a non-negative whole number`);
        resources[r] = n;
      }
      return { ok: true, action: { type: 'BUILD', stack, resources } };
    }
    case 'ACQUIRE_CARD': {
      const slot = record['slot'];
      if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0)
        return bad('ACQUIRE_CARD requires a slot index');
      const rawResources = record['resources'];
      if (typeof rawResources !== 'object' || rawResources === null)
        return bad('ACQUIRE_CARD requires a resources payment');
      const src = rawResources as Record<string, unknown>;
      const resources: Partial<Record<Resource, number>> = {};
      for (const r of RESOURCES) {
        const n = src[r];
        if (n === undefined) continue;
        if (typeof n !== 'number' || !Number.isInteger(n) || n < 0)
          return bad(`ACQUIRE_CARD ${r} must be a non-negative whole number`);
        resources[r] = n;
      }
      return { ok: true, action: { type: 'ACQUIRE_CARD', slot, resources } };
    }
    case 'TAKE_GATHER': {
      const raw = record['toolIndices'];
      if (!Array.isArray(raw)) return bad('TAKE_GATHER requires a toolIndices array');
      const toolIndices: number[] = [];
      for (const i of raw) {
        if (typeof i !== 'number' || !Number.isInteger(i) || i < 0)
          return bad('Each tool index must be a non-negative whole number');
        toolIndices.push(i);
      }
      return { ok: true, action: { type: 'TAKE_GATHER', toolIndices } };
    }
    case 'GATHER':
      return bad('GATHER is server-only — use POST /games/:id/stoneage/roll');
    default:
      return bad(`Unknown action type "${String(record['type'])}"`);
  }
}

const bad = (message: string): ParseResult<Action> => ({ ok: false, message });
