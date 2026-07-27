import { describe, expect, it } from 'vitest';
import { addTool } from '../internal';

describe('addTool (the tool ladder, pg. 5)', () => {
  it('gives value-1 tools for the first three, filling the three slots', () => {
    expect(addTool([])).toEqual([1]);
    expect(addTool([1])).toEqual([1, 1]);
    expect(addTool([1, 1])).toEqual([1, 1, 1]);
  });

  it('then upgrades the lowest slot, climbing 1→2→3→4 in slot order', () => {
    expect(addTool([1, 1, 1])).toEqual([2, 1, 1]);
    expect(addTool([2, 1, 1])).toEqual([2, 2, 1]);
    expect(addTool([2, 2, 1])).toEqual([2, 2, 2]);
    expect(addTool([2, 2, 2])).toEqual([3, 2, 2]);
  });

  it('reaches [4,4,4] after 12 tools and ignores a 13th', () => {
    let tools: number[] = [];
    for (let i = 0; i < 12; i += 1) tools = addTool(tools);
    expect(tools).toEqual([4, 4, 4]);
    expect(addTool(tools)).toEqual([4, 4, 4]); // maxed — no-op
  });
});
