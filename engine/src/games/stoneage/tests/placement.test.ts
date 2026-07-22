import { describe, expect, it } from 'vitest';
import {
  activePlayer,
  availableToPlace,
  canPlace,
  countRange,
  legalPlacements,
  nextPlacer,
  placedBy,
  record,
  seatOf,
} from '../internal';
import { makeState, withPlacements, expectError } from './helpers';

describe('placement counts', () => {
  it('placedBy / availableToPlace sum a player’s placements across places', () => {
    const state = withPlacements({ forest: { p1: 3 }, hunt: { p1: 1, p2: 2 } });
    expect(placedBy(state, 'p1')).toBe(4);
    expect(availableToPlace(state, 'p1')).toBe(1); // 5 people − 4 placed
    expect(availableToPlace(state, 'p2')).toBe(3);
  });
});

describe('countRange', () => {
  it('tool maker / field take exactly 1 while empty, then are full', () => {
    expect(countRange(makeState(), 'toolMaker', 'p1')).toEqual({ min: 1, max: 1 });
    expect(countRange(withPlacements({ toolMaker: { p2: 1 } }), 'toolMaker', 'p1')).toBeNull();
    expect(countRange(makeState(), 'field', 'p1')).toEqual({ min: 1, max: 1 });
  });

  it('the hut takes exactly 2 and needs two people', () => {
    expect(countRange(makeState(), 'hut', 'p1')).toEqual({ min: 2, max: 2 });
    // Only one person left → can't take the hut.
    const oneLeft = withPlacements({ forest: { p1: 4 } });
    expect(countRange(oneLeft, 'hut', 'p1')).toBeNull();
  });

  it('the hunt takes any number up to the people in hand', () => {
    expect(countRange(makeState(), 'hunt', 'p1')).toEqual({ min: 1, max: 5 });
  });

  it('a resource place shares its cap of 7, up to the people in hand', () => {
    // 4-player names so the pg. 8 per-place player cap (which bites at 2–3 players) doesn't mask the
    // 7-total cap this test is about — the player cap gets its own tests below.
    const four = ['A', 'B', 'C', 'D'];
    expect(countRange(makeState(), 'forest', 'p1')).toEqual({ min: 1, max: 5 });
    // 6 already there → only 1 of the 7 remains.
    expect(countRange(withPlacements({ forest: { p2: 6 } }, {}, four), 'forest', 'p1')).toEqual({ min: 1, max: 1 });
    // Full.
    expect(countRange(withPlacements({ forest: { p2: 7 } }, {}, four), 'forest', 'p1')).toBeNull();
  });

  it('is null on a place you already used this round, or with no people left', () => {
    expect(countRange(withPlacements({ forest: { p1: 2 } }), 'forest', 'p1')).toBeNull();
    expect(countRange(withPlacements({ hunt: { p1: 5 } }), 'toolMaker', 'p1')).toBeNull(); // 0 left
  });

  it('a building slot takes exactly 1, but only while its stack has a tile and is unoccupied', () => {
    expect(countRange(makeState(), 'building1', 'p1')).toEqual({ min: 1, max: 1 });
    // Occupied by another player → full.
    expect(countRange(withPlacements({ building1: { p2: 1 } }), 'building1', 'p1')).toBeNull();
    // An emptied stack offers no slot.
    const base = makeState();
    expect(countRange({ ...base, buildings: [[], base.buildings[1]!] }, 'building1', 'p1')).toBeNull();
  });

  it('a card slot takes exactly 1, but only while it holds a card and is unoccupied', () => {
    expect(countRange(makeState(), 'card1', 'p1')).toEqual({ min: 1, max: 1 });
    // Occupied by another player → full.
    expect(countRange(withPlacements({ card1: { p2: 1 } }), 'card1', 'p1')).toBeNull();
    // An empty display slot offers no place.
    const base = makeState();
    expect(countRange({ ...base, cardDisplay: [null, ...base.cardDisplay.slice(1)] }, 'card1', 'p1')).toBeNull();
  });
});

describe('2–3-player restrictions (pg. 8)', () => {
  const three = ['A', 'B', 'C'];
  const four = ['A', 'B', 'C', 'D'];

  it('village lock: with ≤3 players, the empty third of tool maker/hut/field locks once two are filled', () => {
    // Tool maker + field occupied (by others) → the empty hut is locked for everyone.
    const locked = withPlacements({ toolMaker: { p2: 1 }, field: { p3: 1 } }, {}, three);
    expect(countRange(locked, 'hut', 'p1')).toBeNull();
    // Only one filled → the other two are still open.
    const oneFilled = withPlacements({ toolMaker: { p2: 1 } }, {}, three);
    expect(countRange(oneFilled, 'hut', 'p1')).toEqual({ min: 2, max: 2 });
    expect(countRange(oneFilled, 'field', 'p1')).toEqual({ min: 1, max: 1 });
  });

  it('the lock is derived from the current board, so it releases every round (not latched)', () => {
    // The same three-player game with an empty board — nothing is locked.
    expect(countRange(makeState({}, three), 'hut', 'p1')).toEqual({ min: 2, max: 2 });
    expect(countRange(makeState({}, three), 'field', 'p1')).toEqual({ min: 1, max: 1 });
  });

  it('the locked place is first-come — the field locks when tool maker + hut fill instead', () => {
    const locked = withPlacements({ toolMaker: { p2: 1 }, hut: { p3: 2 } }, {}, three);
    expect(countRange(locked, 'field', 'p1')).toBeNull();
    expect(countRange(locked, 'toolMaker', 'p1')).toBeNull(); // occupied by another player, so also unavailable
  });

  it('4-player games are unrestricted: the third village place stays open', () => {
    const filled = withPlacements({ toolMaker: { p2: 1 }, field: { p3: 1 } }, {}, four);
    expect(countRange(filled, 'hut', 'p1')).toEqual({ min: 2, max: 2 });
  });

  it('resource places: with 2 players each place admits at most 1 player per round', () => {
    // Default helper is a 2-player game. One other player on the forest closes it to p1.
    expect(countRange(withPlacements({ forest: { p2: 1 } }), 'forest', 'p1')).toBeNull();
    // The hunt is explicitly uncapped (pg. 8), so it stays open regardless.
    expect(countRange(withPlacements({ hunt: { p2: 3 } }), 'hunt', 'p1')).toEqual({ min: 1, max: 5 });
  });

  it('resource places: with 3 players each place admits at most 2 players per round', () => {
    // One other player present → a second (p1) may still join, still bounded by the shared 7-total cap
    // (6 already there → only 1 of the 7 remains).
    expect(countRange(withPlacements({ forest: { p2: 6 } }, {}, three), 'forest', 'p1')).toEqual({ min: 1, max: 1 });
    // Two others present → the third player is shut out (even with room left in the 7 cap).
    const twoOn = withPlacements({ forest: { p2: 2, p3: 2 } }, {}, three);
    expect(countRange(twoOn, 'forest', 'p1')).toBeNull();
  });

  it('4-player games keep the 4-player resource behaviour — only the 7-total cap applies', () => {
    const threeOn = withPlacements({ forest: { p1: 1, p2: 1, p3: 1 } }, {}, four);
    // A 4th distinct player may still place (no per-player cap at 4 players); room = 7 − 3, p4 has 5.
    expect(countRange(threeOn, 'forest', 'p4')).toEqual({ min: 1, max: 4 });
  });

  it('the hunt is never capped, so a player shut out of every resource place can still place', () => {
    // 2-player game: p2 holds all four resource places, capping each at its 1-player limit.
    const p2Everywhere = withPlacements({ forest: { p2: 1 }, clayPit: { p2: 1 }, quarry: { p2: 1 }, river: { p2: 1 } });
    for (const place of ['forest', 'clayPit', 'quarry', 'river'] as const) {
      expect(countRange(p2Everywhere, place, 'p1')).toBeNull();
    }
    expect(countRange(p2Everywhere, 'hunt', 'p1')).toEqual({ min: 1, max: 5 }); // the escape valve
    expect(canPlace(p2Everywhere, 'p1')).toBe(true); // never a deadlock — placement always terminates
  });
});

describe('canPlace / nextPlacer', () => {
  it('canPlace is false once a player is out of people', () => {
    expect(canPlace(makeState(), 'p1')).toBe(true);
    expect(canPlace(withPlacements({ hunt: { p1: 5 } }), 'p1')).toBe(false);
  });

  it('nextPlacer skips players who can’t place, and returns null when nobody can', () => {
    // p2 has placed all 5; p1 has 1 left → from p1, next is p1 again (p2 skipped).
    const p2Done = withPlacements({ clayPit: { p2: 5 }, forest: { p1: 4 } });
    expect(nextPlacer(p2Done, 0)).toBe(0);
    // Everyone out.
    const allDone = withPlacements({ clayPit: { p2: 5 }, forest: { p1: 5 } });
    expect(nextPlacer(allDone, 0)).toBeNull();
  });
});

describe('legalPlacements', () => {
  it('enumerates one action per legal (place, count) for a fresh board', () => {
    const options = legalPlacements(makeState(), 'p1');
    // toolMaker(1) + field(1) + hut(1) + hunt(1..5)=5 + 4 resource places ×(1..5)=20 → 28,
    // plus 1 per building stack (2 in a 2-player game) + 1 per card slot (4) → 34.
    expect(options).toHaveLength(34);
    expect(options).toContainEqual({ type: 'PLACE', place: 'hut', count: 2 });
    expect(options).toContainEqual({ type: 'PLACE', place: 'hunt', count: 5 });
    expect(options).toContainEqual({ type: 'PLACE', place: 'toolMaker', count: 1 });
  });

  it('skips places that are no longer available', () => {
    // The tool maker is taken, so it drops out (34 − its one option = 33).
    const options = legalPlacements(withPlacements({ toolMaker: { p2: 1 } }), 'p1');
    expect(options).toHaveLength(33);
    expect(options.some((a) => a.type === 'PLACE' && a.place === 'toolMaker')).toBe(false);
  });
});

describe('record + player helpers', () => {
  it('activePlayer / seatOf resolve the active seat', () => {
    const state = makeState({ activePlayerIndex: 1 });
    expect(activePlayer(state).id).toBe('p2');
    expect(seatOf(state, 'p2')).toBe(1);
    expectError(() => seatOf(state, 'ghost'), 'PLAYER_NOT_FOUND');
  });

  it('record bumps the version and logs with or without a payload', () => {
    const state = makeState();
    const withPayload = record(state, 'X', 'p1', { round: 2 }, { a: 1 });
    expect(withPayload.version).toBe(1);
    expect(withPayload.round).toBe(2);
    expect(withPayload.log.at(-1)).toEqual({ seq: 1, type: 'X', playerId: 'p1', payload: { a: 1 } });
    const noPayload = record(state, 'Y', 'p2');
    expect(noPayload.log.at(-1)).toEqual({ seq: 1, type: 'Y', playerId: 'p2' });
  });
});
