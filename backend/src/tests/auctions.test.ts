import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Action, GameState, GameView } from '@game-hub/game-container/engine';
import { createGame } from '@game-hub/game-container/engine';
import type { DB } from '../db';
import { containerModule } from '../games';
import type { StateMessage } from '../hub';
import { GameRepository } from '../repository';
import { newApp, wsReader } from './helpers';

/**
 * Container's delivery auctions (A1) over REST — the sealed-bid flow the module registers under
 * `/games/:id/container/auction`. A game-specific *module* suite, split out of the core routes file:
 * the rule it exists to protect is that a bid stays secret until every opponent has committed.
 */

let app: FastifyInstance;
let db: DB;

beforeEach(async () => {
  ({ app, db } = await newApp());
});

afterEach(async () => {
  await app.close();
});

/**
 * A pushed state message with its `game` typed as Container's view. The hub's `StateMessage.game` is
 * `unknown` by design (C1 — the transport hosts any game and must not know one game's shape), so the
 * cast belongs here: these are Container games, and this is the boundary that knows it.
 */
type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;
type ContainerStateMessage = Omit<StateMessage, 'game'> & { game: GameView };
const reader = (socket: WsClient) => wsReader<ContainerStateMessage>(socket);

async function createThreePlayerGame(): Promise<GameView> {
  const response = await app.inject({
    method: 'POST',
    url: '/games',
    payload: { players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
  });
  expect(response.statusCode).toBe(201);
  return response.json().game as GameView;
}

function act(gameId: string, playerId: string, action: Action) {
  return app.inject({ method: 'POST', url: `/games/${gameId}/actions`, payload: { playerId, action } });
}

// --- Delivery auctions (A1) -------------------------------------------------------------------
//
// The rule these tests exist to protect: a bid is secret until *every* opponent has committed. That
// was impossible before — the deliverer typed all the bids on their own screen, so they chose
// whether to buy out already knowing what they'd be paid.

/**
 * Seed a game whose deliverer is one hop from Container Island with cargo aboard, then sail in.
 * Sailing (rather than writing the auction row directly) is what a real client does, so this covers
 * the trigger as well as the auction.
 */
async function startDelivery(cargo: ('red' | 'blue' | 'white' | 'green' | 'yellow')[] = ['red', 'blue']) {
  const base = createGame({ id: 'auction-game', players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] });
  const state: GameState = {
    ...base,
    players: base.players.map((player, seat) =>
      seat === 0 ? { ...player, ship: { location: { kind: 'ocean' as const }, cargo } } : player,
    ),
  };
  new GameRepository(db).create(containerModule, state);
  const sailed = await act(state.id, 'p1', { type: 'SAIL', to: { kind: 'island' } });
  expect(sailed.statusCode).toBe(200);
  return state.id;
}

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

describe('Delivery auctions — opening', () => {
  it('opens automatically when a loaded ship reaches the island', async () => {
    const gameId = await startDelivery();
    const auction = await getAuction(gameId);
    expect(auction).toMatchObject({ delivererId: 'p1', phase: 'bidding', cargo: ['red', 'blue'] });
    expect(auction.bidders).toEqual([
      { playerId: 'p2', hasBid: false },
      { playerId: 'p3', hasBid: false },
    ]);
  });

  it('reports no auction for a game that is not delivering', async () => {
    const game = await createThreePlayerGame();
    expect(await getAuction(game.id)).toBeNull();
  });

  it('404s for a game that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/games/nope/container/auction' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('GAME_NOT_FOUND');
  });

  it('heals a game that reached the island without an auction row', async () => {
    // A live game upgraded mid-delivery has no auction row. Deriving the auction from the game state
    // rather than trusting the row keeps it from wedging at the island with no way to resolve.
    const gameId = await startDelivery();
    db.prepare('DELETE FROM delivery_auctions WHERE game_id = ?').run(gameId);
    expect(await getAuction(gameId)).toMatchObject({ delivererId: 'p1', phase: 'bidding' });
  });
});

describe('Delivery auctions — sealed bids', () => {
  it('hides every bid until the last opponent has committed', async () => {
    const gameId = await startDelivery();
    expect((await bid(gameId, 'p2', 4)).statusCode).toBe(200);

    // p3 has not bid yet, so nothing is revealed — not to p3, and above all not to the deliverer.
    const toDeliverer = await getAuction(gameId, 'p1');
    expect(toDeliverer.phase).toBe('bidding');
    expect(toDeliverer.revealed).toBeNull();
    expect(toDeliverer.winningBid).toBeNull();
    expect(toDeliverer.bidders).toEqual([
      { playerId: 'p2', hasBid: true }, // *that* they bid is public; what they bid is not
      { playerId: 'p3', hasBid: false },
    ]);
    expect(JSON.stringify(toDeliverer)).not.toContain('4');

    const toRival = await getAuction(gameId, 'p3');
    expect(toRival.revealed).toBeNull();
    expect(toRival.yourBid).toBeNull();
  });

  it('shows a bidder their own bid but never anyone else’s', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    expect((await getAuction(gameId, 'p2')).yourBid).toBe(4);
    expect((await getAuction(gameId, 'p3')).yourBid).toBeNull();
  });

  it('reveals every bid once all are in, and flips to the deliverer’s decision', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 7);

    const auction = await getAuction(gameId, 'p1');
    expect(auction.phase).toBe('decision');
    expect(auction.revealed).toEqual({ p2: 4, p3: 7 });
    expect(auction.winningBid).toBe(7);
  });

  it('accepts a $0 bluff', async () => {
    // pg. 15: "They may use $0 bluff cards." $0 is a bid, not an abstention.
    const gameId = await startDelivery();
    expect((await bid(gameId, 'p2', 0)).statusCode).toBe(200);
    expect((await getAuction(gameId, 'p2')).yourBid).toBe(0);
  });

  it('rejects a bid beyond the bidder’s cash', async () => {
    const gameId = await startDelivery();
    const response = await bid(gameId, 'p2', 999);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('rejects a negative bid', async () => {
    const gameId = await startDelivery();
    expect((await bid(gameId, 'p2', -1)).statusCode).toBe(400);
  });

  it('rejects the deliverer bidding in their own auction', async () => {
    const gameId = await startDelivery();
    const response = await bid(gameId, 'p1', 3);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_A_BIDDER');
  });

  it('rejects a second bid from the same player', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    const response = await bid(gameId, 'p2', 5);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('ALREADY_BID');
  });

  it('rejects bids once bidding has closed', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 1);
    const response = await bid(gameId, 'p2', 9);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('BIDDING_CLOSED');
  });

  it('rejects bidding when no auction is open', async () => {
    const game = await createThreePlayerGame();
    const response = await bid(game.id, 'p2', 1);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NO_OPEN_AUCTION');
  });
});

describe('Delivery auctions — resolution', () => {
  it('accepting pays the deliverer the bid plus a matching subsidy and ships the cargo', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 7);

    const response = await resolve(gameId, 'p1');
    expect(response.statusCode).toBe(200);
    const game = response.json().game as GameView;

    // p3 wins at $7: pays $7, takes the cargo. p1 collects $7 + $7 subsidy.
    expect(game.players[2]!.scoringArea).toEqual(['red', 'blue']);
    expect(game.players[2]!.money).toBe(20 - 7);
    expect(game.players[0]!.money).toBe(20 + 14);
    expect(game.players[0]!.ship.cargo).toEqual([]);
    // The delivery ends the turn (pg. 15), and the auction is done.
    expect(game.activePlayerIndex).toBe(1);
    expect(await getAuction(gameId)).toBeNull();
  });

  it('buying out pays the Bank and keeps the cargo, with no subsidy', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 1);

    const game = (await resolve(gameId, 'p1', true)).json().game as GameView;
    expect(game.players[0]!.scoringArea).toEqual(['red', 'blue']);
    expect(game.players[0]!.money).toBe(20 - 4); // paid the winning bid, earned no subsidy
    expect(game.players[1]!.money).toBe(20); // the high bidder's bid is returned
  });

  it('rejects resolution before every opponent has bid', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    const response = await resolve(gameId, 'p1');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('BIDDING_OPEN');
  });

  it('rejects anyone but the deliverer resolving', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 7);
    const response = await resolve(gameId, 'p2');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_THE_DELIVERER');
  });

  it('rejects resolving when no auction is open', async () => {
    const game = await createThreePlayerGame();
    const response = await resolve(game.id, 'p1');
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NO_OPEN_AUCTION');
  });
});

describe('Delivery auctions — no bypassing the sealed bids', () => {
  it('refuses a DELIVER posted straight to /actions while an auction is due', async () => {
    // Without this, a client could skip the auction and submit bids it invented — or, worse, the
    // deliverer's own client could resolve using bids it had already seen.
    const gameId = await startDelivery();
    const response = await act(gameId, 'p1', { type: 'DELIVER', bids: { p2: 0, p3: 0 } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('AUCTION_PENDING');
  });
});

describe('Delivery auctions — off-turn loans (pg. 16)', () => {
  it('lets a broke opponent borrow mid-auction and then bid', async () => {
    // The rulebook's worked example: "Red starts a delivery auction. Blue takes a loan before bidding."
    const base = createGame({ id: 'loan-game', players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] });
    const state: GameState = {
      ...base,
      players: base.players.map((player, seat) => {
        if (seat === 0) return { ...player, ship: { location: { kind: 'ocean' as const }, cargo: ['red' as const] } };
        return seat === 1 ? { ...player, money: 0 } : player;
      }),
    };
    new GameRepository(db).create(containerModule, state);
    await act(state.id, 'p1', { type: 'SAIL', to: { kind: 'island' } });

    // Broke, and it is not p2's turn — but a loan is legal at any time.
    expect((await bid(state.id, 'p2', 5)).statusCode).toBe(409);
    const loan = await act(state.id, 'p2', { type: 'REQUEST_LOAN' });
    expect(loan.statusCode).toBe(200);
    expect((await bid(state.id, 'p2', 5)).statusCode).toBe(200);
  });

  it('still refuses an off-turn action that is not a loan', async () => {
    const gameId = await startDelivery();
    const response = await act(gameId, 'p2', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_YOUR_TURN');
  });
});

describe('Delivery auctions — live push', () => {
  it('pushes the auction to every seat, redacted per client', async () => {
    const gameId = await startDelivery();

    const delivererSocket = await app.injectWS(`/games/${gameId}/stream?viewer=p1`);
    const bidderSocket = await app.injectWS(`/games/${gameId}/stream?viewer=p2`);
    const nextDeliverer = reader(delivererSocket as never);
    const nextBidder = reader(bidderSocket as never);
    await nextDeliverer(); // initial state snapshot
    await nextBidder();

    await bid(gameId, 'p2', 6);

    // Both clients learn p2 has bid; neither is told the amount — least of all the deliverer, who
    // must choose whether to buy out without knowing what they'd be paid.
    const pushedToDeliverer = (await nextDeliverer()) as unknown as { type: string; auction: Record<string, unknown> };
    expect(pushedToDeliverer.type).toBe('auction');
    expect(pushedToDeliverer.auction.revealed).toBeNull();
    expect(JSON.stringify(pushedToDeliverer.auction)).not.toContain('6');

    const pushedToBidder = (await nextBidder()) as unknown as { type: string; auction: Record<string, unknown> };
    expect(pushedToBidder.auction.yourBid).toBe(6); // you may always see your own bid

    delivererSocket.terminate();
    bidderSocket.terminate();
  });

  it('pushes the reveal once the last bid lands, then clears on resolve', async () => {
    const gameId = await startDelivery();
    const socket = await app.injectWS(`/games/${gameId}/stream?viewer=p1`);
    const next = reader(socket as never);
    await next(); // initial snapshot

    await bid(gameId, 'p2', 2);
    await next(); // auction push (still bidding)
    await bid(gameId, 'p3', 5);

    const revealPush = (await next()) as unknown as { auction: Record<string, unknown> };
    expect(revealPush.auction.phase).toBe('decision');
    expect(revealPush.auction.revealed).toEqual({ p2: 2, p3: 5 });

    await resolve(gameId, 'p1');
    await next(); // the resolving state broadcast
    const cleared = (await next()) as unknown as { type: string; auction: unknown };
    expect(cleared.type).toBe('auction');
    expect(cleared.auction).toBeNull();

    socket.terminate();
  });
});

describe('Delivery auctions — runoff and the deliverer’s tie choice (A1b, pg. 16)', () => {
  const resolveWith = (gameId: string, body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/games/${gameId}/container/auction/resolve`, payload: body });

  it('opens a runoff when the leaders tie, and only they bid again', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 4);

    const auction = await getAuction(gameId, 'p1');
    expect(auction.phase).toBe('runoff');
    // The opening bids are public now — tied players add cash *knowing* what they're level on.
    expect(auction.revealed).toEqual({ p2: 4, p3: 4 });
    expect(auction.winningBid).toBeNull(); // not settled yet
    // Only the tied players owe a runoff bid.
    expect(auction.bidders.map((b: { playerId: string }) => b.playerId)).toEqual(['p2', 'p3']);
  });

  it('adds the runoff bid to the opening bid — the highest total wins', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 4);
    await bid(gameId, 'p2', 1); // p2 → $5 total
    await bid(gameId, 'p3', 0); // p3 → $4 total

    const auction = await getAuction(gameId, 'p1');
    expect(auction.phase).toBe('decision');
    expect(auction.runoffRevealed).toEqual({ p2: 1, p3: 0 });
    expect(auction.winningBid).toBe(5);
    expect(auction.choiceRequired).toEqual([]); // p2 won outright

    const game = (await resolveWith(gameId, { playerId: 'p1' })).json().game as GameView;
    expect(game.players[1]!.scoringArea).toEqual(['red', 'blue']);
    expect(game.players[1]!.money).toBe(20 - 5); // paid the $5 total
    expect(game.players[0]!.money).toBe(20 + 10); // total + matching subsidy
  });

  it('a runoff bid must be affordable on top of the opening bid, not on its own', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 15);
    await bid(gameId, 'p3', 15);
    // $15 already committed, so a further $10 would need $25 of the $20 they hold.
    const response = await bid(gameId, 'p2', 10);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
    expect((await bid(gameId, 'p2', 5)).statusCode).toBe(200); // exactly $20 is fine
  });

  it('keeps a non-tied player out of the runoff', async () => {
    const base = createGame({
      id: 'runoff-4p',
      players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }, { name: 'Dee' }],
    });
    const state: GameState = {
      ...base,
      players: base.players.map((player, seat) =>
        seat === 0 ? { ...player, ship: { location: { kind: 'ocean' as const }, cargo: ['red' as const] } } : player,
      ),
    };
    new GameRepository(db).create(containerModule, state);
    await act(state.id, 'p1', { type: 'SAIL', to: { kind: 'island' } });

    await bid(state.id, 'p2', 5);
    await bid(state.id, 'p3', 5);
    await bid(state.id, 'p4', 1); // out of contention

    const response = await bid(state.id, 'p4', 9);
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_A_BIDDER');
  });

  it('hands a still-level runoff to the deliverer to decide', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 4);
    await bid(gameId, 'p2', 2); // both reach $6
    await bid(gameId, 'p3', 2);

    const auction = await getAuction(gameId, 'p1');
    expect(auction.phase).toBe('decision');
    expect(auction.winningBid).toBe(6);
    expect(auction.choiceRequired).toEqual(['p2', 'p3']);

    // Resolving without naming a winner is refused by the engine, rather than quietly defaulting
    // to the earliest seat as it used to.
    const noChoice = await resolveWith(gameId, { playerId: 'p1' });
    expect(noChoice.statusCode).toBe(409);
    expect(noChoice.json().error.code).toBe('CHOICE_REQUIRED');

    const game = (await resolveWith(gameId, { playerId: 'p1', winnerId: 'p3' })).json().game as GameView;
    expect(game.players[2]!.scoringArea).toEqual(['red', 'blue']); // Cid, the *later* seat
    expect(game.players[1]!.scoringArea).toEqual([]);
    expect(game.players[2]!.money).toBe(20 - 6);
    expect(game.players[0]!.money).toBe(20 + 12);
  });

  it('rejects handing the cargo to someone who is not tied', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 1); // no tie at all
    const response = await resolveWith(gameId, { playerId: 'p1', winnerId: 'p3' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_SELECTION');
  });

  it('needs no choice to buy out of a still-level runoff', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 3);
    await bid(gameId, 'p3', 3);
    await bid(gameId, 'p2', 0);
    await bid(gameId, 'p3', 0);

    const game = (await resolveWith(gameId, { playerId: 'p1', buyout: true })).json().game as GameView;
    expect(game.players[0]!.scoringArea).toEqual(['red', 'blue']);
    expect(game.players[0]!.money).toBe(20 - 3);
    expect(game.players[1]!.money).toBe(20); // all tied bidders get their bids back
    expect(game.players[2]!.money).toBe(20);
  });

  it('treats an all-$0 bluff as a tie the deliverer must break', async () => {
    // Everyone bluffing $0 still ties for the highest bid, so it is a real decision rather than a
    // free win for whoever sits earliest.
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 0);
    await bid(gameId, 'p3', 0);
    expect((await getAuction(gameId, 'p1')).phase).toBe('runoff');

    await bid(gameId, 'p2', 0);
    await bid(gameId, 'p3', 0);
    const auction = await getAuction(gameId, 'p1');
    expect(auction.choiceRequired).toEqual(['p2', 'p3']);

    const game = (await resolveWith(gameId, { playerId: 'p1', winnerId: 'p2' })).json().game as GameView;
    expect(game.players[1]!.scoringArea).toEqual(['red', 'blue']);
    expect(game.players[0]!.money).toBe(20); // $0 bid, $0 subsidy
  });

  it('keeps runoff bids secret until the runoff closes', async () => {
    const gameId = await startDelivery();
    await bid(gameId, 'p2', 4);
    await bid(gameId, 'p3', 4);
    await bid(gameId, 'p2', 7);

    const toDeliverer = await getAuction(gameId, 'p1');
    expect(toDeliverer.runoffRevealed).toBeNull();
    expect(toDeliverer.bidders).toEqual([
      { playerId: 'p2', hasBid: true },
      { playerId: 'p3', hasBid: false },
    ]);
    // p2's $7 must not leak to the deliverer or to their rival mid-runoff.
    expect((await getAuction(gameId, 'p3')).yourBid).toBeNull();
    expect((await getAuction(gameId, 'p2')).yourBid).toBe(7);
  });
});
