import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { applyAction, COLORS, createGame, GameError } from '@container/engine';
import type { Action, Color, District, NewPlayer, ShipLocation, StoredContainer } from '@container/engine';
import type { DB } from './db';
import { GameRepository } from './repository';

export interface AppOptions {
  db: DB;
  logger?: boolean;
}

interface CreateGameBody {
  players: NewPlayer[];
}

interface RawContainer {
  color: string;
  price: number;
}

interface RawAction {
  type: Action['type'];
  color?: string;
  placements?: RawContainer[];
  district?: string;
  arrangement?: RawContainer[];
  to?: { kind?: string; playerId?: string };
}

interface ActionBody {
  playerId: string;
  action: RawAction;
}

/** Map a domain error to an HTTP status. Unknown errors bubble to Fastify's 500 handler. */
function sendGameError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof GameError) {
    const status =
      error.code === 'PLAYER_NOT_FOUND'
        ? 404
        : error.code === 'INVALID_PLAYER_COUNT'
          ? 400
          : 409; // illegal move given current state (wrong turn, no actions, bad build, …)
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

/** JSON-schema for one container placement/arrangement item ({ color, price }). */
const STORED_CONTAINER_SCHEMA = {
  type: 'object',
  required: ['color', 'price'],
  properties: {
    color: { type: 'string' },
    price: { type: 'number' },
  },
} as const;

const badRequest = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ error: { code: 'BAD_ACTION', message } });

const notFound = (reply: FastifyReply, id: string) =>
  reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

/** Turn a validated request body into a typed engine Action, or reply 400 and return null. */
function parseAction(reply: FastifyReply, raw: RawAction): Action | null {
  switch (raw.type) {
    case 'PRODUCE':
      return raw.placements
        ? { type: 'PRODUCE', placements: raw.placements as StoredContainer[] }
        : { type: 'PRODUCE' };
    case 'BUILD_FACTORY':
      if (!raw.color || !COLORS.includes(raw.color as Color)) {
        badRequest(reply, 'BUILD_FACTORY requires a valid container color');
        return null;
      }
      return { type: 'BUILD_FACTORY', color: raw.color as Color };
    case 'BUILD_WAREHOUSE':
      return { type: 'BUILD_WAREHOUSE' };
    case 'REPRICE':
      if (raw.district !== 'factory' && raw.district !== 'harbor') {
        badRequest(reply, 'REPRICE requires a district of "factory" or "harbor"');
        return null;
      }
      return raw.arrangement
        ? { type: 'REPRICE', district: raw.district as District, arrangement: raw.arrangement as StoredContainer[] }
        : { type: 'REPRICE', district: raw.district as District };
    case 'SAIL': {
      const to = raw.to;
      if (!to || (to.kind !== 'ocean' && to.kind !== 'harbor' && to.kind !== 'island' && to.kind !== 'bank')) {
        badRequest(reply, 'SAIL requires a destination kind of ocean/harbor/island/bank');
        return null;
      }
      if (to.kind === 'harbor') {
        if (!to.playerId) {
          badRequest(reply, 'SAIL to a harbor requires a playerId');
          return null;
        }
        return { type: 'SAIL', to: { kind: 'harbor', playerId: to.playerId } };
      }
      return { type: 'SAIL', to: { kind: to.kind } as ShipLocation };
    }
    case 'END_TURN':
      return { type: 'END_TURN' };
    default:
      badRequest(reply, `Unknown action type "${String(raw.type)}"`);
      return null;
  }
}

/** Build a Fastify instance wired to a database. Pure factory — no listening, easy to test. */
export function buildApp(options: AppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const repo = new GameRepository(options.db);

  app.get('/health', async () => ({ status: 'ok' }));

  app.post<{ Body: CreateGameBody }>(
    '/games',
    {
      schema: {
        body: {
          type: 'object',
          required: ['players'],
          properties: {
            players: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', minLength: 1 },
                  startingColor: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const state = createGame({ id: randomUUID(), players: request.body.players });
        repo.create(state);
        return reply.code(201).send({ game: state });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  app.get<{ Params: { id: string } }>('/games/:id', async (request, reply) => {
    const state = repo.get(request.params.id);
    if (!state) return notFound(reply, request.params.id);
    return reply.send({ game: state });
  });

  app.post<{ Params: { id: string }; Body: ActionBody }>(
    '/games/:id/actions',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId', 'action'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            action: {
              type: 'object',
              required: ['type'],
              properties: {
                type: {
                  type: 'string',
                  enum: ['PRODUCE', 'BUILD_FACTORY', 'BUILD_WAREHOUSE', 'REPRICE', 'SAIL', 'END_TURN'],
                },
                color: { type: 'string' },
                district: { type: 'string', enum: ['factory', 'harbor'] },
                placements: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                arrangement: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                to: {
                  type: 'object',
                  properties: {
                    kind: { type: 'string', enum: ['ocean', 'harbor', 'island', 'bank'] },
                    playerId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);

      const action = parseAction(reply, request.body.action);
      if (!action) return reply; // parseAction already sent a 400

      try {
        const next = applyAction(state, request.body.playerId, action);
        repo.update(next);
        return reply.send({ game: next });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  return app;
}
