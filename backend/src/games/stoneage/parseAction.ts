import { PLACES } from '@game-hub/engine/stoneage';
import type { Action, PlaceId } from '@game-hub/engine/stoneage';
import type { ParseResult } from '../module';

/**
 * Validate opaque JSON into a typed Stone Age `Action`. So far only `PLACE` exists (roadmap SA1); each
 * later stage adds its action here. Structural checks only — the engine judges legality (which place is
 * full, whose turn it is) and answers with a `GameError`.
 */
export function parseStoneAgeAction(raw: unknown): ParseResult<Action> {
  if (typeof raw !== 'object' || raw === null) return bad('An action must be an object');
  const record = raw as Record<string, unknown>;

  // GATHER is server-only: the roll route builds its dice, so a client can't post one.
  if (record['type'] === 'GATHER') return bad('GATHER is server-only — use POST /games/:id/stoneage/roll');
  if (record['type'] !== 'PLACE') return bad(`Unknown action type "${String(record['type'])}"`);

  const place = record['place'];
  if (typeof place !== 'string' || !PLACES.includes(place as PlaceId)) {
    return bad('PLACE requires a valid board place');
  }
  const count = record['count'];
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
    return bad('PLACE requires a positive whole-number count');
  }
  return { ok: true, action: { type: 'PLACE', place: place as PlaceId, count } };
}

const bad = (message: string): ParseResult<Action> => ({ ok: false, message });
