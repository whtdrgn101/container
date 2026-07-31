import { describe, expect, it } from 'vitest';
import type { GameMessage } from '../contracts/transport';
import { isChatPush, isPresencePush } from '../contracts/platform';

// The platform-envelope guards narrow an *open* `GameMessage` to a typed `chat`/`presence` frame. They are
// runtime code (unlike the rest of `contracts/`), so the kernel's 100% gate measures them here: every
// branch of each `type === … && Array.isArray(…)` — the wrong-type short-circuit, the right-type-but-
// missing-array reject, and the accept — has a case.

describe('isChatPush', () => {
  it('accepts a chat frame carrying a messages array', () => {
    const message: GameMessage = {
      type: 'chat',
      messages: [{ seq: 1, senderId: 'p1', sender: 'Ann', body: 'hi', at: '2026-07-31T00:00:00.000Z' }],
    };
    expect(isChatPush(message)).toBe(true);
    if (isChatPush(message)) {
      // The narrowing is real: `messages` is typed after the guard, no cast needed.
      expect(message.messages[0]?.sender).toBe('Ann');
    }
  });

  it('rejects a frame of another type without looking at its fields', () => {
    expect(isChatPush({ type: 'presence', viewers: [] })).toBe(false);
    expect(isChatPush({ type: 'state', game: {} })).toBe(false);
  });

  it('rejects a chat-typed frame whose messages is not an array', () => {
    expect(isChatPush({ type: 'chat' })).toBe(false);
    expect(isChatPush({ type: 'chat', messages: 'nope' })).toBe(false);
  });
});

describe('isPresencePush', () => {
  it('accepts a presence frame carrying a viewers array', () => {
    const message: GameMessage = { type: 'presence', viewers: [{ id: '1', label: 'Ann' }] };
    expect(isPresencePush(message)).toBe(true);
    if (isPresencePush(message)) {
      expect(message.viewers[0]?.label).toBe('Ann');
    }
  });

  it('rejects a frame of another type without looking at its fields', () => {
    expect(isPresencePush({ type: 'chat', messages: [] })).toBe(false);
    expect(isPresencePush({ type: 'state', game: {} })).toBe(false);
  });

  it('rejects a presence-typed frame whose viewers is not an array', () => {
    expect(isPresencePush({ type: 'presence' })).toBe(false);
    expect(isPresencePush({ type: 'presence', viewers: 42 })).toBe(false);
  });
});
