import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { createGame, GameError, produce } from '@container/engine';
import type { Color, NewPlayer } from '@container/engine';
import type { DB } from './db';
import { GameRepository } from './repository';

export interface AppOptions {
  db: DB;
  logger?: boolean;
}

interface CreateGameBody {
  players: NewPlayer[];
}

interface ProduceBody {
  playerId: string;
  select?: Color[];
}

/** Map a domain error to an HTTP status. Unknown errors bubble to Fastify's 500 handler. */
function sendGameError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof GameError) {
    const status =
      error.code === 'PLAYER_NOT_FOUND'
        ? 404
        : error.code === 'INVALID_PLAYER_COUNT'
          ? 400
          : 409; // illegal move given current state
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

const notFound = (reply: FastifyReply, id: string) =>
  reply.code(404).send({ error: { code: 'GAME_NOT_FOUND', message: `No game with id "${id}"` } });

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

  app.post<{ Params: { id: string }; Body: ProduceBody }>(
    '/games/:id/produce',
    {
      schema: {
        body: {
          type: 'object',
          required: ['playerId'],
          properties: {
            playerId: { type: 'string', minLength: 1 },
            select: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const state = repo.get(request.params.id);
      if (!state) return notFound(reply, request.params.id);
      try {
        const next = produce(state, request.body.playerId, request.body.select);
        repo.update(next);
        return reply.send({ game: next });
      } catch (error) {
        return sendGameError(reply, error);
      }
    },
  );

  return app;
}
