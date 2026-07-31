import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { SchemaUnsupportedError } from '../repository';
import { isAllowedWsOrigin, WS_MAX_PAYLOAD } from '../security';
import type { AppServices } from '../services';

/**
 * The push-only live-stream WebSocket (Track B / B2): a client connects, gets an immediate snapshot,
 * then receives a per-viewer push on every state change. REST stays authoritative; this socket only
 * fans state out. Registers the `@fastify/websocket` plugin itself, so the whole transport concern
 * lives in one file.
 */
export function registerStreamRoutes(app: FastifyInstance, services: AppServices): void {
  const { moduleOf, repo, hub, wsConnections, allowedOrigins, tick, stateMessage } = services;

  // `maxPayload` (§4.7): the stream is push-only, so a client legitimately sends no data frames at all
  // — a small inbound cap rejects anything a misbehaving or hostile peer tries to push up the socket.
  app.register(fastifyWebsocket, { options: { maxPayload: WS_MAX_PAYLOAD } });

  // Live game stream. A client connects, gets an immediate snapshot, then receives a push on every
  // state change — each projected for `?viewer=<id>` (omit to follow the active player, for hotseat).
  app.register(async (instance) => {
    instance.get<{ Params: { id: string }; Querystring: { viewer?: string } }>(
      '/games/:id/stream',
      { websocket: true },
      (socket, request) => {
        // WS is exempt from CORS (§4.7): without an origin check any page a LAN user visits could open
        // this socket and read their projected state. Refuse a cross-origin upgrade — same-origin and
        // non-browser (no Origin) clients pass, plus any configured `allowedOrigins`.
        if (!isAllowedWsOrigin(request.headers.origin, request.headers.host, allowedOrigins)) {
          socket.close(1008, 'Cross-origin WebSocket connections are not allowed');
          return;
        }
        // Per-IP concurrent-connection cap (§4.7): one tab opens one socket, so a flood is abuse.
        const ip = request.ip;
        if (!wsConnections.tryAcquire(ip)) {
          socket.close(1013, 'Too many concurrent connections'); // 1013 = Try Again Later
          return;
        }
        // Release on 'error' as well as 'close': a proxy reset (the Vite dev proxy's documented
        // ECONNRESET under load) can error a socket without a clean close. The hub's heartbeat reaps a
        // half-open socket within a sweep or two, but this releases the IP slot immediately rather than
        // waiting for it. `release` is idempotent per acquire only if called once, so guard double-fire.
        let released = false;
        const releaseOnce = () => {
          if (!released) {
            released = true;
            wsConnections.release(ip);
          }
        };
        socket.on('close', releaseOnce);
        socket.on('error', releaseOnce);
        const module = moduleOf(request.params.id);
        if (!module) {
          socket.close(1008, `No game with id "${request.params.id}"`);
          return;
        }
        let state: unknown;
        try {
          state = repo.get(module, request.params.id);
        } catch (error) {
          if (error instanceof SchemaUnsupportedError) {
            socket.close(1011, 'Game was saved by a newer version of this server');
            return;
          }
          throw error;
        }
        if (state === undefined) {
          socket.close(1008, `No game with id "${request.params.id}"`);
          return;
        }
        // No `?viewer` ⇒ follow the active player; `?viewer=p1,p3` ⇒ those seats; `?viewer=` ⇒ spectator.
        const viewer = request.query.viewer !== undefined ? request.query.viewer.split(',').filter(Boolean) : null;
        const unsubscribe = hub.subscribe(request.params.id, socket, viewer);
        socket.on('close', unsubscribe);
        tick(request.params.id); // a watching client is enough to drive stalled bot turns
        // Send the first snapshot on the next tick, after the open handshake settles, so a client
        // that attaches its message handler right after connecting never misses it.
        setImmediate(() => hub.send(socket, stateMessage(module, request.params.id, state, viewer)));
      },
    );
  });
}
