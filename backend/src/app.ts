import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { applyAction, COLORS, createGame, GameError, SCORING_CARDS } from '@container/engine';
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
  sellerId?: string;
  bought?: RawContainer[];
  bids?: Record<string, number>;
  runoffBids?: Record<string, number>;
  buyout?: boolean;
  lotIndex?: number;
  bid?: number;
  lotKind?: string;
  containerBid?: RawContainer[];
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
    case 'FACTORY_PURCHASE':
      if (!raw.sellerId) {
        badRequest(reply, 'FACTORY_PURCHASE requires a sellerId');
        return null;
      }
      return raw.bought
        ? { type: 'FACTORY_PURCHASE', sellerId: raw.sellerId, bought: raw.bought as StoredContainer[] }
        : { type: 'FACTORY_PURCHASE', sellerId: raw.sellerId };
    case 'HARBOR_PURCHASE':
      return raw.bought
        ? { type: 'HARBOR_PURCHASE', bought: raw.bought as StoredContainer[] }
        : { type: 'HARBOR_PURCHASE' };
    case 'DELIVER':
      return {
        type: 'DELIVER',
        ...(raw.bids ? { bids: raw.bids } : {}),
        ...(raw.runoffBids ? { runoffBids: raw.runoffBids } : {}),
        ...(raw.buyout ? { buyout: true } : {}),
      };
    case 'REQUEST_LOAN':
      return { type: 'REQUEST_LOAN' };
    case 'REPAY_LOAN':
      return { type: 'REPAY_LOAN' };
    case 'CALL_BANK':
      if (typeof raw.lotIndex !== 'number') {
        badRequest(reply, 'CALL_BANK requires a lotIndex');
        return null;
      }
      return {
        type: 'CALL_BANK',
        lotIndex: raw.lotIndex,
        lotKind: raw.lotKind === 'cash' ? 'cash' : 'container',
        ...(raw.bid !== undefined ? { bid: raw.bid } : {}),
        ...(raw.containerBid ? { containerBid: raw.containerBid as StoredContainer[] } : {}),
      };
    case 'LOAD_FROM_BANK':
      return { type: 'LOAD_FROM_BANK' };
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
        // Shuffle the scoring cards and deal one to each player (kept secret client-side).
        const cardIds = SCORING_CARDS.map((card) => card.id);
        for (let i = cardIds.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const swap = cardIds[i]!;
          cardIds[i] = cardIds[j]!;
          cardIds[j] = swap;
        }
        const players = request.body.players.map((player, seat) => ({ ...player, scoringCardId: cardIds[seat]! }));

        const state = createGame({ id: randomUUID(), players });
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
                  enum: [
                    'PRODUCE',
                    'BUILD_FACTORY',
                    'BUILD_WAREHOUSE',
                    'REPRICE',
                    'SAIL',
                    'FACTORY_PURCHASE',
                    'HARBOR_PURCHASE',
                    'DELIVER',
                    'REQUEST_LOAN',
                    'REPAY_LOAN',
                    'CALL_BANK',
                    'LOAD_FROM_BANK',
                    'END_TURN',
                  ],
                },
                color: { type: 'string' },
                district: { type: 'string', enum: ['factory', 'harbor'] },
                sellerId: { type: 'string' },
                lotIndex: { type: 'number' },
                lotKind: { type: 'string', enum: ['container', 'cash'] },
                containerBid: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                placements: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                arrangement: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                bought: { type: 'array', items: STORED_CONTAINER_SCHEMA },
                bids: { type: 'object', additionalProperties: { type: 'number' } },
                runoffBids: { type: 'object', additionalProperties: { type: 'number' } },
                buyout: { type: 'boolean' },
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
