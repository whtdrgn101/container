import { PLACES } from '@game-hub/engine/stoneage';
import type { Action, PlaceId } from '@game-hub/engine/stoneage';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Stone Age `Action`: `PLACE` (SA1) and `USE` (the non-dice places,
 * SA4–6). `GATHER` is server-only (the roll route builds its dice). Structural checks only — the engine
 * judges legality (whose turn, which place is full/wrong-kind) and answers with a `GameError`.
 */
export function parseStoneAgeAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) return bad('An action must be an object');
  const record = raw as Record<string, unknown>;

  const place = record['place'];
  const validPlace = typeof place === 'string' && PLACES.includes(place as PlaceId);

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
    case 'GATHER':
      return bad('GATHER is server-only — use POST /games/:id/stoneage/roll');
    default:
      return bad(`Unknown action type "${String(record['type'])}"`);
  }
}

const bad = (message: string): ParseResult<Action> => ({ ok: false, message });
