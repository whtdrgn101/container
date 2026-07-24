import { describe, expect, it } from 'vitest';
import { locoReach, scoreIndustry, scorePlayer, scoreRoute } from '../internal';
import { VALUATION } from '../core';
import type { Locomotive, Route, RussianRailroadsPlayer, TrackColor } from '../core';
import { newGame } from './helpers';

/** A route of `length` empty spaces with the given colour tiles placed at the given indices. */
function route(id: Route['id'], length: number, tiles: Partial<Record<number, TrackColor>>): Route {
  const spaces = Array.from({ length }, (_, i) => tiles[i] ?? null);
  return { id, spaces };
}

describe('scoring', () => {
  it('sums locomotive numbers on a route for its reach (pg. 20)', () => {
    const locos: Locomotive[] = [
      { number: 6, route: 'transsiberian' },
      { number: 2, route: 'transsiberian' },
      { number: 3, route: 'kyiv' },
    ];
    expect(locoReach(locos, 'transsiberian')).toBe(8); // #6 + #2
    expect(locoReach(locos, 'kyiv')).toBe(3);
    expect(locoReach(locos, 'stpetersburg')).toBe(0); // no loco → no reach
  });

  it('scores each reached space by the nearest track at or ahead of it (pg. 20 example)', () => {
    // The pg. 20 Trans-Siberian shape: bronze frontier at space 3, green at 7, wood at 9. With reach 8 the
    // last wood tile itself (space 9) is out of reach, but space 8 behind it is treated as wood (0).
    const r = route('transsiberian', 10, { 2: 'bronze', 6: 'green', 8: 'wood' });
    // spaces 1-3 bronze (2 each), 4-7 green (1 each), 8 wood (0) → 6 + 4 + 0 = 10.
    expect(scoreRoute(r, 8, 0, VALUATION, false)).toBe(10);
    // Wood only ever scores 0, whatever the reach.
    expect(scoreRoute(route('kyiv', 8, { 0: 'wood' }), 8, 0, VALUATION, false)).toBe(0);
  });

  it('scores nothing for spaces beyond the furthest track, and nothing at reach 0', () => {
    // Reach 4 but the only track is wood at space 1 (index 0): spaces 2-4 have no track ahead → 0. Give a
    // silver tile at index 2 so there is a non-zero, and leave index 3 (space 4) with nothing ahead.
    const r = route('transsiberian', 6, { 0: 'wood', 2: 'silver' });
    // space1: nearest ahead = wood@0 → 0; space2: silver@2 → 4; space3: silver@2 → 4; space4: nothing ahead → 0.
    expect(scoreRoute(r, 4, 0, VALUATION, false)).toBe(8);
    expect(scoreRoute(r, 0, 0, VALUATION, false)).toBe(0); // reach 0 scores nothing at all
  });

  it('industry is a stub of 0 (RR5)', () => {
    const player = newGame(2).players[0]!;
    expect(scoreIndustry(player)).toBe(0);
  });

  it('scores a whole player: routes + industry', () => {
    const base = newGame(2).players[0]!;
    const player: RussianRailroadsPlayer = {
      ...base,
      locomotives: [{ number: 5, route: 'transsiberian' }],
      routes: [
        route('transsiberian', 10, { 4: 'green' }), // reach 5: spaces 1-5 treated green (1 each) = 5
        route('stpetersburg', 7, { 0: 'wood' }), // no loco → reach 0 → 0
        route('kyiv', 8, { 0: 'wood' }), // no loco → 0
      ],
    };
    expect(scorePlayer(player)).toEqual({ playerId: player.id, routes: 5, industry: 0, bonus: 0, gained: 5 });
  });
});
