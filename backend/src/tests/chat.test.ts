import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { GameHub } from '../hub';
import type { Pingable, Sendable } from '../hub';
import { presenceLabel } from '../presence';
import { newApp } from './helpers';

/**
 * In-game chat + presence (the feature the WS envelope's `type` field was left extensible for).
 *
 * Chat is sent over REST and fanned out as a `{ type: 'chat' }` envelope; presence is derived from the
 * subscription lifecycle and pushed as `{ type: 'presence' }` on every change. Both are coordination
 * state — game-agnostic and table-public — so Container is just the vehicle here; nothing asserted is
 * Container-shaped.
 */

const WS_OPEN = 1;
const WS_CLOSED = 3;

/** A fake live-stream socket that captures sent frames and can replay a `pong` (for reap tests). */
class FakeSocket implements Sendable, Pingable {
  readyState = WS_OPEN;
  readonly sent: string[] = [];
  private readonly pongListeners: Array<() => void> = [];
  send(data: string): void {
    this.sent.push(data);
  }
  ping(): void {
    /* no-op: the reap tests never pong these unless told to */
  }
  terminate(): void {
    this.readyState = WS_CLOSED;
  }
  on(_event: 'pong', listener: () => void): void {
    this.pongListeners.push(listener);
  }
  pong(): void {
    for (const listener of this.pongListeners) listener();
  }
  /** The most recent presence roster this socket received (labels), or undefined if none. */
  lastPresence(): string[] | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const msg = JSON.parse(this.sent[i]!) as { type: string; viewers?: { label: string }[] };
      if (msg.type === 'presence') return msg.viewers!.map((v) => v.label);
    }
    return undefined;
  }
}

describe('presenceLabel (pure)', () => {
  const players = [
    { id: 'p1', name: 'Ann' },
    { id: 'p2', name: 'Bob' },
  ];

  it('names a single bound seat', () => {
    expect(presenceLabel(['p1'], players)).toBe('Ann');
  });
  it('joins multiple bound seats', () => {
    expect(presenceLabel(['p1', 'p2'], players)).toBe('Ann & Bob');
  });
  it('labels an empty viewer a spectator', () => {
    expect(presenceLabel([], players)).toBe('Spectator');
  });
  it('labels a null (hotseat / follow-active) viewer the table', () => {
    expect(presenceLabel(null, players)).toBe('Table');
  });
  it('falls back to the raw id for an unknown seat', () => {
    expect(presenceLabel(['pX'], players)).toBe('pX');
  });
});

describe('GameHub presence fan-out', () => {
  it('pushes the roster to the room on subscribe, and to survivors on unsubscribe', () => {
    const hub = new GameHub();
    const a = new FakeSocket();
    const b = new FakeSocket();

    const leaveA = hub.subscribe('g', a, ['p1'], 'Ann');
    expect(a.lastPresence()).toEqual(['Ann']); // alone: just me

    hub.subscribe('g', b, ['p2'], 'Bob');
    expect(a.lastPresence()).toEqual(['Ann', 'Bob']); // the newcomer is broadcast to everyone
    expect(b.lastPresence()).toEqual(['Ann', 'Bob']);

    leaveA(); // Ann leaves
    expect(b.lastPresence()).toEqual(['Bob']); // the survivor's roster refreshes
  });

  it('refreshes the roster for survivors when a half-open socket is reaped', () => {
    const hub = new GameHub();
    const dead = new FakeSocket();
    const live = new FakeSocket();
    hub.subscribe('g', dead, ['p1'], 'Ann');
    hub.subscribe('g', live, ['p2'], 'Bob');

    hub.sweep(); // pings both, marks pending
    live.pong(); // only Bob answers
    hub.sweep(); // Ann is reaped

    expect(dead.readyState).toBe(WS_CLOSED);
    expect(live.lastPresence()).toEqual(['Bob']); // reap refreshed the roster
  });
});

describe('POST /games/:id/chat', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  const start = async (): Promise<string> => {
    ({ app } = await newApp());
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
    });
    expect(res.statusCode).toBe(201);
    return res.json().game.id as string;
  };

  const send = (id: string, playerId: string, body: string) =>
    app.inject({ method: 'POST', url: `/games/${id}/chat`, payload: { playerId, body } });

  it('stores a message from a seated player and returns it', async () => {
    const id = await start();
    const res = await send(id, 'p1', 'hello table');
    expect(res.statusCode).toBe(201);
    expect(res.json().message).toMatchObject({ seq: 1, senderId: 'p1', sender: 'Ann', body: 'hello table' });
    expect(typeof res.json().message.at).toBe('string');
  });

  it('assigns a monotonically increasing per-game sequence', async () => {
    const id = await start();
    expect((await send(id, 'p1', 'one')).json().message.seq).toBe(1);
    expect((await send(id, 'p2', 'two')).json().message.seq).toBe(2);
    expect((await send(id, 'p1', 'three')).json().message.seq).toBe(3);
  });

  it('rejects a sender that is not a seat in the game (spectators are read-only)', async () => {
    const id = await start();
    const res = await send(id, 'p9', 'let me in');
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SENDER');
  });

  it('rejects an empty / whitespace-only body', async () => {
    const id = await start();
    expect((await send(id, 'p1', '   ')).statusCode).toBe(400); // trimmed to empty
    const missing = await app.inject({ method: 'POST', url: `/games/${id}/chat`, payload: { playerId: 'p1' } });
    expect(missing.statusCode).toBe(400); // schema: body required
    const emptyString = await app.inject({
      method: 'POST',
      url: `/games/${id}/chat`,
      payload: { playerId: 'p1', body: '' },
    });
    expect(emptyString.statusCode).toBe(400); // schema: minLength 1
  });

  it('rejects an over-long body', async () => {
    const id = await start();
    const res = await send(id, 'p1', 'x'.repeat(501));
    expect(res.statusCode).toBe(400);
  });

  it('404s for a game that does not exist', async () => {
    ({ app } = await newApp());
    const res = await app.inject({ method: 'POST', url: '/games/nope/chat', payload: { playerId: 'p1', body: 'hi' } });
    expect(res.statusCode).toBe(404);
  });
});

/** A raw pull-based WS reader that, unlike the shared `wsReader`, keeps presence/chat frames. */
function rawReader(socket: { on(event: 'message', listener: (raw: unknown) => void): void }) {
  type Msg = { type: string; [key: string]: unknown };
  const queue: Msg[] = [];
  const pending: Array<(m: Msg) => void> = [];
  socket.on('message', (raw: unknown) => {
    const msg = JSON.parse(String(raw)) as Msg;
    const resolve = pending.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  });
  const next = () => (queue.length ? Promise.resolve(queue.shift()!) : new Promise<Msg>((r) => pending.push(r)));
  /** Read frames until one of `type` arrives (skipping the rest). */
  const nextOf = async (type: string): Promise<Msg> => {
    for (;;) {
      const msg = await next();
      if (msg.type === type) return msg;
    }
  };
  return { next, nextOf };
}

describe('chat + presence over the WebSocket', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  const start = async (): Promise<string> => {
    ({ app } = await newApp());
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
    });
    return res.json().game.id as string;
  };

  it('fans a chat message out to every viewer, labelled with the seat name', async () => {
    const id = await start();
    const socket = await app.injectWS(`/games/${id}/stream?viewer=p2`);
    const { nextOf } = rawReader(socket);

    await app.inject({ method: 'POST', url: `/games/${id}/chat`, payload: { playerId: 'p1', body: 'gg' } });
    const chat = (await nextOf('chat')) as unknown as { messages: { sender: string; body: string }[] };
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0]).toMatchObject({ sender: 'Ann', body: 'gg' });

    socket.close();
  });

  it('backfills the recent tail to a resuming client, and shows a bound viewer its seat in presence', async () => {
    const id = await start();
    // Post a few messages before anyone is watching.
    for (const [seat, body] of [
      ['p1', 'a'],
      ['p2', 'b'],
      ['p3', 'c'],
    ] as const) {
      await app.inject({ method: 'POST', url: `/games/${id}/chat`, payload: { playerId: seat, body } });
    }

    const socket = await app.injectWS(`/games/${id}/stream?viewer=p1`);
    const { nextOf } = rawReader(socket);

    // Presence: a p1-bound viewer is labelled with its seat name.
    const presence = (await nextOf('presence')) as unknown as { viewers: { label: string }[] };
    expect(presence.viewers.map((v) => v.label)).toEqual(['Ann']);

    // Backfill: the whole (short) history in order.
    const history = (await nextOf('chat')) as unknown as { messages: { body: string }[] };
    expect(history.messages.map((m) => m.body)).toEqual(['a', 'b', 'c']);

    socket.close();
  });

  it('caps the resume backfill to the most recent 100 messages', async () => {
    const id = await start();
    for (let i = 1; i <= 101; i++) {
      await app.inject({ method: 'POST', url: `/games/${id}/chat`, payload: { playerId: 'p1', body: `m${i}` } });
    }

    const socket = await app.injectWS(`/games/${id}/stream?viewer=p1`);
    const { nextOf } = rawReader(socket);
    const history = (await nextOf('chat')) as unknown as { messages: { seq: number; body: string }[] };

    expect(history.messages).toHaveLength(100);
    expect(history.messages[0]!.body).toBe('m2'); // the oldest (m1 / seq 1) fell off the tail
    expect(history.messages[99]!.body).toBe('m101');

    socket.close();
  });

  it('drops a viewer from presence when its socket closes', async () => {
    const id = await start();
    const watcher = await app.injectWS(`/games/${id}/stream?viewer=p1`);
    const { nextOf } = rawReader(watcher);
    await nextOf('presence'); // watcher present

    const leaver = await app.injectWS(`/games/${id}/stream?viewer=p2`);
    // Both are now present; wait until the watcher sees the two-viewer roster.
    let roster = await nextOf('presence');
    while ((roster as unknown as { viewers: unknown[] }).viewers.length < 2) roster = await nextOf('presence');
    expect((roster as unknown as { viewers: { label: string }[] }).viewers.map((v) => v.label)).toEqual(['Ann', 'Bob']);

    // `terminate` (not a graceful `close`) is what reliably emits the server-side close under injectWS,
    // running the stream route's unsubscribe — the same path a dropped tab or a heartbeat reap takes.
    leaver.terminate();
    // The watcher is pushed a fresh roster with only itself.
    let after = await nextOf('presence');
    while ((after as unknown as { viewers: unknown[] }).viewers.length > 1) after = await nextOf('presence');
    expect((after as unknown as { viewers: { label: string }[] }).viewers.map((v) => v.label)).toEqual(['Ann']);

    watcher.close();
  });
});
