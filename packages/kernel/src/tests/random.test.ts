import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../random';

describe('mulberry32', () => {
  it('is deterministic given a seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('yields values in [0, 1)', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 100; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds give different streams', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('is exported from ./bot as well, as the same function', async () => {
    // Every game's bench imports it from the bot subpath; the 1.2.0 move must not have changed that.
    const bot = await import('../bot/index');
    expect(bot.mulberry32).toBe(mulberry32);
  });
});

describe('shuffle', () => {
  const deck = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  it('keeps the given order when no rng is supplied (deterministic deals for tests)', () => {
    expect(shuffle(deck)).toEqual([...deck]);
  });

  it('returns a new array and never mutates the input', () => {
    const input = [...deck];
    const out = shuffle(input, mulberry32(7));
    expect(input).toEqual([...deck]);
    expect(out).not.toBe(input);
  });

  it('is a permutation — same multiset, every element still present', () => {
    const out = shuffle(deck, mulberry32(3));
    expect([...out].sort((a, b) => a - b)).toEqual([...deck]);
  });

  it('actually reorders, and reproduces exactly from a seed', () => {
    const once = shuffle(deck, mulberry32(3));
    const twice = shuffle(deck, mulberry32(3));
    expect(once).toEqual(twice);
    expect(once).not.toEqual([...deck]);
    // A different seed gives a different deal (guards against an rng that is ignored).
    expect(shuffle(deck, mulberry32(4))).not.toEqual(once);
  });

  it('handles the degenerate sizes the loop guard exists for', () => {
    expect(shuffle([], mulberry32(1))).toEqual([]);
    expect(shuffle(['only'], mulberry32(1))).toEqual(['only']);
  });
});
