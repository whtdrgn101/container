import { describe, expect, it } from 'vitest';
import { BotError, makeProgressGuard } from '..';

describe('makeProgressGuard', () => {
  it('tolerates many actions as long as the marker keeps advancing', () => {
    const guard = makeProgressGuard({ maxPerMarker: 3, marker: 'turn', initial: 0 });
    // A different marker every action → the counter resets each time, so this never trips.
    expect(() => {
      for (let turn = 1; turn <= 100; turn += 1) guard.record(turn, 'p1');
    }).not.toThrow();
  });

  it('throws once too many actions land at the same marker', () => {
    const guard = makeProgressGuard({ maxPerMarker: 2, marker: 'turn', initial: 5 });
    guard.record(5, 'p1'); // 1
    guard.record(5, 'p1'); // 2 (at the cap, still fine)
    expect(() => guard.record(5, 'p1')).toThrow(BotError); // 3 > 2 → cycle
  });

  it('reports the cycling seat, count and marker in the message', () => {
    const guard = makeProgressGuard({ maxPerMarker: 1, marker: 'round', initial: 4 });
    guard.record(4, 'p3');
    expect(() => guard.record(4, 'p3')).toThrow(
      /Bot seat "p3" took 2 actions in round 4 without ending it — a policy is cycling/,
    );
  });

  it('resets the counter when the marker advances', () => {
    const guard = makeProgressGuard({ maxPerMarker: 2, marker: 'turn', initial: 0 });
    guard.record(0, 'p1'); // 1
    guard.record(0, 'p1'); // 2
    guard.record(1, 'p1'); // marker advanced → reset
    // Back to a fresh budget at the new marker.
    guard.record(1, 'p1'); // 1
    expect(() => guard.record(1, 'p1')).not.toThrow(); // 2, still at the cap
    expect(() => guard.record(1, 'p1')).toThrow(BotError); // 3 > 2
  });
});
