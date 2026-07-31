import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Action, GameState, GameView } from '@game-hub/game-container/engine';
import { createGame } from '@game-hub/game-container/engine';
import type { DB } from '../db';
import { containerModule } from '../games';
import { GameRepository } from '../repository';
import { newApp } from './helpers';

/**
 * The bot-seat platform (A2) over REST, driven through Container: the server runs the AI, so these
 * make a move and check the bots have taken their turns by the time the response returns. Bot-ness is
 * coordination state beside the game and game-agnostic — this exercises that plumbing, not the AI.
 */

let app: FastifyInstance;
let db: DB;

beforeEach(async () => {
  ({ app, db } = await newApp());
});

afterEach(async () => {
  await app.close();
});

function act(gameId: string, playerId: string, action: Action) {
  return app.inject({ method: 'POST', url: `/games/${gameId}/actions`, payload: { playerId, action } });
}

// The Container auction helpers the "Bot seats — delivery auctions" suite drives (same shape as in
// auctions.test.ts): read the projected auction, place a bid, resolve it.
const getAuction = async (gameId: string, viewer?: string) =>
  (
    await app.inject({
      method: 'GET',
      url: `/games/${gameId}/container/auction${viewer ? `?viewer=${viewer}` : ''}`,
    })
  ).json().auction;

const bid = (gameId: string, playerId: string, amount: number) =>
  app.inject({ method: 'POST', url: `/games/${gameId}/container/auction/bids`, payload: { playerId, bid: amount } });

const resolve = (gameId: string, playerId: string, buyout?: boolean) =>
  app.inject({
    method: 'POST',
    url: `/games/${gameId}/container/auction/resolve`,
    payload: { playerId, ...(buyout === undefined ? {} : { buyout }) },
  });

// --- Bot seats (A2) ---------------------------------------------------------------------------
//
// The AI runs server-side, so these drive it the way a real client does: make a move, and see that
// the bots have taken their turns by the time the response comes back.

const createWithBots = async (bots: boolean[]) => {
  const response = await app.inject({
    method: 'POST',
    url: '/games',
    payload: {
      players: [
        { name: 'Ann', bot: bots[0] === true },
        { name: 'Bob', bot: bots[1] === true },
        { name: 'Cid', bot: bots[2] === true },
      ],
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { game: GameView; bots: string[] };
};

describe('Bot seats — creating', () => {
  it('records which seats the AI holds and reports them alongside the game', async () => {
    const { bots } = await createWithBots([false, true, true]);
    expect(bots).toEqual(['p2', 'p3']);

    // The bot list travels with the game everywhere, so a client can label the seats.
    const fetched = await app.inject({
      method: 'GET',
      url: '/games/' + (await createWithBots([false, true, false])).game.id,
    });
    expect(fetched.json().bots).toEqual(['p2']);
  });

  it('leaves an all-human game with no bots', async () => {
    const { bots } = await createWithBots([false, false, false]);
    expect(bots).toEqual([]);
  });

  it('never leaks bot-ness into the engine state', async () => {
    // Bot-ness is coordination state. If it reached GameState it would become a rules concept.
    const { game } = await createWithBots([false, true, true]);
    expect(JSON.stringify(game)).not.toContain('bot');
  });
});

describe('Bot seats — resuming', () => {
  it('marks AI seats in the resume list so a human is never offered one', async () => {
    // Resuming a bot seat would put a second driver on it — and hand a person the bot's secret card.
    const { game } = await createWithBots([false, true, false]);
    const summaries = (await app.inject({ method: 'GET', url: '/games' })).json().games as {
      id: string;
      bots: string[];
    }[];
    const mine = summaries.find((summary) => summary.id === game.id)!;
    expect(mine.bots).toEqual(['p2']);
  });

  it('reports no bots for an all-human game', async () => {
    const { game } = await createWithBots([false, false, false]);
    const summaries = (await app.inject({ method: 'GET', url: '/games' })).json().games as {
      id: string;
      bots: string[];
    }[];
    expect(summaries.find((summary) => summary.id === game.id)!.bots).toEqual([]);
  });
});

describe('Bot seats — the runner', () => {
  it('plays the bots’ turns before the human is asked to move again', async () => {
    const { game } = await createWithBots([false, true, true]);
    expect(game.activePlayerIndex).toBe(0); // Ann, the human, opens

    const response = await act(game.id, 'p1', { type: 'END_TURN' });
    expect(response.statusCode).toBe(200);

    // Bob and Cid took their turns inside that request — it is Ann's move again already.
    const after = response.json().game as GameView;
    expect(after.activePlayerIndex).toBe(0);
    expect(after.turn).toBeGreaterThan(game.turn);
    // And they actually did something, rather than just passing.
    expect(after.log.some((move) => move.playerId === 'p2' && move.type !== 'END_TURN')).toBe(true);
  });

  it('opens the game by playing bots that sit before the first human', async () => {
    // Ann is a bot in seat 1, so she must have moved before the human ever sees the board.
    const { game } = await createWithBots([true, false, false]);
    expect(game.activePlayerIndex).toBe(1); // Bob, the human
    expect(game.log.some((move) => move.playerId === 'p1')).toBe(true);
  });

  it('plays an all-bot game to the end on its own', async () => {
    const { game } = await createWithBots([true, true, true]);
    expect(game.status).toBe('ended');
    if (game.status !== 'ended') throw new Error('expected ended');
    expect(game.winnerIds.length).toBeGreaterThan(0);
    // Every card is revealed once the game is over, so this is a full, scored result.
    expect(game.results).toHaveLength(3);
  });

  it('does nothing to an all-human game', async () => {
    const { game } = await createWithBots([false, false, false]);
    const after = (await act(game.id, 'p1', { type: 'END_TURN' })).json().game as GameView;
    expect(after.activePlayerIndex).toBe(1); // Bob's turn — nobody played it for him
  });
});

describe('Bot seats — delivery auctions', () => {
  /** A game where Ann (human) is one hop from the island and the other two seats are bots. */
  async function botsBidding() {
    const base = createGame({ id: 'bot-auction', players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] });
    const state: GameState = {
      ...base,
      players: base.players.map((player, seat) =>
        seat === 0
          ? { ...player, ship: { location: { kind: 'ocean' as const }, cargo: ['red' as const, 'blue' as const] } }
          : player,
      ),
    };
    new GameRepository(db).create(containerModule, state);
    db.prepare('INSERT INTO game_bots (game_id, player_id) VALUES (?, ?)').run(state.id, 'p2');
    db.prepare('INSERT INTO game_bots (game_id, player_id) VALUES (?, ?)').run(state.id, 'p3');
    return state.id;
  }

  it('bots bid on a human’s delivery without the human ever seeing the amounts first', async () => {
    const gameId = await botsBidding();
    const sailed = await act(gameId, 'p1', { type: 'SAIL', to: { kind: 'island' } });
    expect(sailed.statusCode).toBe(200);

    // Both bots bid inside that request, so the auction is already at the reveal.
    const auction = await getAuction(gameId, 'p1');
    expect(auction.phase).toBe('decision');
    expect(Object.keys(auction.revealed)).toEqual(['p2', 'p3']);
    expect(auction.choiceRequired.length === 0 || auction.choiceRequired.length === 2).toBe(true);

    // The human still makes the call — a bot never resolves someone else's delivery.
    const resolved = await resolve(gameId, 'p1', true); // buy out: needs no winner choice
    expect(resolved.statusCode).toBe(200);
    expect((resolved.json().game as GameView).players[0]!.scoringArea).toEqual(['red', 'blue']);
  });

  it('a bot deliverer runs its own auction end to end', async () => {
    // Bob (a bot) is loaded and one hop out; Ann and Cid are human.
    const base = createGame({ id: 'bot-delivers', players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] });
    const state: GameState = {
      ...base,
      activePlayerIndex: 1,
      players: base.players.map((player, seat) =>
        seat === 1 ? { ...player, ship: { location: { kind: 'ocean' as const }, cargo: ['red' as const] } } : player,
      ),
    };
    new GameRepository(db).create(containerModule, state);
    db.prepare('INSERT INTO game_bots (game_id, player_id) VALUES (?, ?)').run(state.id, 'p2');

    // The bot sails in on its own turn, opening the auction and pinning itself there.
    const auction = await getAuction(state.id, 'p1');
    expect(auction).not.toBeNull();
    expect(auction.delivererId).toBe('p2');
    expect(auction.phase).toBe('bidding');

    // The humans bid from their own devices; the last one lets the bot settle it.
    expect((await bid(state.id, 'p1', 4)).statusCode).toBe(200);
    expect((await bid(state.id, 'p3', 1)).statusCode).toBe(200);

    // The bot resolved inside that request — the auction is gone and the turn has moved on.
    expect(await getAuction(state.id, 'p1')).toBeNull();
    const settled = (await app.inject({ method: 'GET', url: `/games/${state.id}` })).json().game as GameView;
    expect(settled.players[1]!.ship.cargo).toEqual([]);
    expect(settled.activePlayerIndex).not.toBe(1);
  });
});
