import { describe, expect, it } from 'vitest';
import { viewFor } from '../view';
import { makeState } from './helpers';

describe('viewFor', () => {
  it('passes the whole state through (nothing is hidden) and notes the viewer', () => {
    const state = makeState({ runners: { 6: 3 } });
    expect(viewFor(state, 'p1')).toEqual({ ...state, viewerId: 'p1' });
  });

  it('carries a null (spectator) viewer', () => {
    const state = makeState();
    expect(viewFor(state, null).viewerId).toBeNull();
  });
});
