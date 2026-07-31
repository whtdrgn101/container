import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameHub } from '../hub';
import type { Pingable, Sendable } from '../hub';

const WS_OPEN = 1;
const WS_CLOSED = 3;

/** A fake live-stream socket that records pings/terminate and can replay a `pong` on demand. */
class FakeSocket implements Sendable, Pingable {
  readyState = WS_OPEN;
  readonly sent: string[] = [];
  pings = 0;
  terminated = false;
  private readonly pongListeners: Array<() => void> = [];

  send(data: string): void {
    this.sent.push(data);
  }
  ping(): void {
    this.pings += 1;
  }
  terminate(): void {
    this.terminated = true;
    this.readyState = WS_CLOSED;
  }
  on(_event: 'pong', listener: () => void): void {
    this.pongListeners.push(listener);
  }
  /** Simulate the peer answering the last ping. */
  pong(): void {
    for (const listener of this.pongListeners) listener();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('GameHub heartbeat (§4.7 — reaping half-open sockets)', () => {
  it('terminates and drops a socket that never answers a ping', () => {
    const hub = new GameHub();
    const socket = new FakeSocket();
    hub.subscribe('g', socket, null);

    hub.sweep(); // first sweep pings and marks the socket pending
    expect(socket.pings).toBe(1);
    expect(socket.terminated).toBe(false);
    expect(hub.subscriberCount('g')).toBe(1);

    hub.sweep(); // no pong arrived → reap it
    expect(socket.terminated).toBe(true);
    expect(hub.subscriberCount('g')).toBe(0);
  });

  it('spares a socket that answers each ping with a pong', () => {
    const hub = new GameHub();
    const socket = new FakeSocket();
    hub.subscribe('g', socket, null);

    hub.sweep();
    socket.pong(); // the peer is alive
    hub.sweep();

    expect(socket.terminated).toBe(false);
    expect(socket.pings).toBe(2);
    expect(hub.subscriberCount('g')).toBe(1);
  });

  it('never pings or reaps a bare Sendable (the broadcast-only path)', () => {
    const hub = new GameHub();
    const bare: Sendable = { readyState: WS_OPEN, send: () => {} };
    hub.subscribe('g', bare, null);

    hub.sweep();
    hub.sweep();

    expect(hub.subscriberCount('g')).toBe(1); // a non-pingable socket is left entirely alone
  });

  it('skips a socket that is no longer open (its own close path reaps it)', () => {
    const hub = new GameHub();
    const socket = new FakeSocket();
    socket.readyState = WS_CLOSED;
    hub.subscribe('g', socket, null);

    hub.sweep();
    hub.sweep();

    expect(socket.pings).toBe(0);
    expect(socket.terminated).toBe(false);
  });

  it('pings on the configured interval and stops on stopHeartbeat', () => {
    vi.useFakeTimers();
    const hub = new GameHub();
    const socket = new FakeSocket();
    hub.subscribe('g', socket, null);

    hub.startHeartbeat(1000);
    hub.startHeartbeat(1000); // idempotent — a second call must not double the sweep rate
    vi.advanceTimersByTime(1000);
    expect(socket.pings).toBe(1);

    vi.advanceTimersByTime(1000); // still no pong → reaped on the second sweep
    expect(socket.terminated).toBe(true);

    hub.stopHeartbeat();
    hub.stopHeartbeat(); // safe to call again
    const before = socket.pings;
    vi.advanceTimersByTime(5000);
    expect(socket.pings).toBe(before); // no further sweeps after stop
  });
});
