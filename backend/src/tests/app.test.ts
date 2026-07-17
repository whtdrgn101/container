import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Action, GameState, GameView } from '@game-hub/engine/container';
import { createGame } from '@game-hub/engine/container';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { containerModule } from '../games';
import type { StateMessage } from '../hub';
import { GameRepository } from '../repository';

let app: FastifyInstance;
let db: DB;

beforeEach(async () => {
  db = createDatabase(':memory:');
  app = buildApp({ db });
  await app.ready(); // load plugins (registers @fastify/websocket's injectWS + upgrade handler)
});

afterEach(async () => {
  await app.close();
});

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

type WsClient = Awaited<ReturnType<FastifyInstance['injectWS']>>;

/** Wrap a WebSocket in a pull-based reader: `next()` resolves with the next JSON message. */
/**
 * A pushed state message with its `game` typed as Container's view.
 *
 * The hub's `StateMessage.game` is `unknown` by design (C1 — the transport hosts any game and must
 * not know one game's shape), so the cast belongs here: these are Container games, and this is the
 * boundary that knows it.
 */
type ContainerStateMessage = Omit<StateMessage, 'game'> & { game: GameView };

function reader(socket: WsClient): () => Promise<ContainerStateMessage> {
  const queue: ContainerStateMessage[] = [];
  const pending: Array<(m: ContainerStateMessage) => void> = [];
  socket.on('message', (raw: unknown) => {
    const msg = JSON.parse(String(raw)) as ContainerStateMessage;
    const resolve = pending.shift();
    if (resolve) resolve(msg);
    else queue.push(msg);
  });
  return () =>
    queue.length
      ? Promise.resolve(queue.shift()!)
      : new Promise<ContainerStateMessage>((r) => pending.push(r));
}

describe('POST /games', () => {
  it('creates a 3-player game', async () => {
    const game = await createThreePlayerGame();
    expect(game.players).toHaveLength(3);
    expect(game.actionsRemaining).toBe(2);
    expect(game.players[0]?.money).toBe(20);
  });

  it('deals a distinct secret scoring card to each player, redacting it per viewer (B1)', async () => {
    const game = await createThreePlayerGame();
    // The create response is projected for the active player (seat 0): only they see their card.
    expect(game.players[0]?.scoringCard).not.toBeNull();
    expect(game.players[1]?.scoringCard).toBeNull();
    expect(game.players[2]?.scoringCard).toBeNull();

    // Fetched as each seat, a player sees its own card and no opponent's — and the deal is distinct.
    const ownIds: string[] = [];
    for (const seat of game.players) {
      const response = await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=${seat.id}` });
      expect(response.statusCode).toBe(200);
      const view = response.json().game as GameView;
      for (const p of view.players) {
        if (p.id === seat.id) {
          expect(p.scoringCard).not.toBeNull();
          expect(p.scoringCard!.id).toMatch(/^sc\d$/);
          ownIds.push(p.scoringCard!.id);
        } else {
          expect(p.scoringCard).toBeNull();
        }
      }
    }
    expect(new Set(ownIds).size).toBe(3); // dealt without replacement
  });

  it('hides every scoring card from a spectator with no seat (B1)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=nobody` });
    const view = response.json().game as GameView;
    expect(view.players.every((p) => p.scoringCard === null)).toBe(true);
  });

  it('rejects an invalid player count with 400', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bob' }] },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_PLAYER_COUNT');
  });

  it('rejects a malformed body via schema validation', async () => {
    const response = await app.inject({ method: 'POST', url: '/games', payload: {} });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /games/:id', () => {
  it('returns a persisted game', async () => {
    const created = await createThreePlayerGame();
    const response = await app.inject({ method: 'GET', url: `/games/${created.id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json().game.id).toBe(created.id);
  });

  it('returns 404 for an unknown game', async () => {
    const response = await app.inject({ method: 'GET', url: '/games/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('GAME_NOT_FOUND');
  });

  it('lists in-progress games as secret-free summaries for resuming', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({ method: 'GET', url: '/games' });
    const summary = (response.json().games as { id: string; players: { id: string; name: string }[]; activePlayerId: string }[]).find(
      (g) => g.id === game.id,
    )!;
    expect(summary.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cid']);
    expect(summary.activePlayerId).toBe('p1');
    expect(summary.players[0]).not.toHaveProperty('scoringCard'); // no hidden info in the summary
  });

  it('projects a multi-seat viewer to exactly those seats and no others (B2)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({ method: 'GET', url: `/games/${game.id}?viewer=p1,p3` });
    const view = response.json().game as GameView;
    expect(view.players[0]!.scoringCard).not.toBeNull(); // held
    expect(view.players[1]!.scoringCard).toBeNull(); // not held
    expect(view.players[2]!.scoringCard).not.toBeNull(); // held
  });
});

describe('POST /games/:id/actions', () => {
  it('produces containers and persists the new state', async () => {
    const game = await createThreePlayerGame();

    const response = await act(game.id, 'p1', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.version).toBe(1);
    expect(updated.actionsRemaining).toBe(1);
    expect(updated.players[0]?.factoryStore).toHaveLength(2);
    expect(updated.players[1]?.money).toBe(21); // union wage to the right

    const reload = await app.inject({ method: 'GET', url: `/games/${game.id}` });
    expect((reload.json().game as GameState).version).toBe(1);
  });

  it('builds a factory', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'BUILD_FACTORY', color: 'red' });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).players[0]?.factories).toHaveLength(2);
  });

  it('produces into a chosen lot', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'PRODUCE', placements: [{ color: 'white', price: 5 }] });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).players[0]?.factoryStore).toEqual([
      { color: 'white', price: 2 },
      { color: 'white', price: 5 },
    ]);
  });

  it('reprices the factory district', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', {
      type: 'REPRICE',
      district: 'factory',
      arrangement: [{ color: 'white', price: 6 }],
    });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).players[0]?.factoryStore).toEqual([{ color: 'white', price: 6 }]);
  });

  it('rejects REPRICE without an arrangement (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'REPRICE', district: 'factory' });
    expect(response.statusCode).toBe(409);
  });

  it('rejects REPRICE with a missing district (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'REPRICE' } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('sails the ship to the Off-Shore Bank', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'SAIL', to: { kind: 'bank' } });
    expect(response.statusCode).toBe(200);
    expect((response.json().game as GameState).players[0]?.ship.location).toEqual({ kind: 'bank' });
  });

  it('rejects sailing into your own harbor (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'SAIL', to: { kind: 'harbor', playerId: 'p1' } });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CANNOT_ENTER_OWN_HARBOR');
  });

  it('rejects SAIL to a harbor without a playerId (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'SAIL', to: { kind: 'harbor' } } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('buys a container from an opponent factory into the harbor', async () => {
    const game = await createThreePlayerGame();
    // p2's starting factory color is red, in the $2 lot.
    const response = await act(game.id, 'p1', {
      type: 'FACTORY_PURCHASE',
      sellerId: 'p2',
      bought: [{ color: 'red', price: 2 }],
    });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.players[0]?.harborStore).toEqual([{ color: 'red', price: 2 }]);
    expect(updated.players[0]?.money).toBe(18);
    expect(updated.players[1]?.money).toBe(22);
  });

  it('rejects buying from yourself (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', {
      type: 'FACTORY_PURCHASE',
      sellerId: 'p1',
      bought: [{ color: 'white', price: 2 }],
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_AN_OPPONENT');
  });

  it('rejects FACTORY_PURCHASE without a sellerId (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'FACTORY_PURCHASE', bought: [{ color: 'red', price: 2 }] } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects HARBOR_PURCHASE when the ship is not docked (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'HARBOR_PURCHASE', bought: [{ color: 'red', price: 2 }] });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SHIP_NOT_DOCKED');
  });

  it('rejects DELIVER when the ship is not at the island (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'DELIVER', bids: {} });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('INVALID_DELIVERY');
  });

  it('takes a loan as a free action', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'REQUEST_LOAN' });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.players[0]?.loans).toBe(1);
    expect(updated.players[0]?.money).toBe(30);
    expect(updated.actionsRemaining).toBe(2); // free
  });

  it('rejects repaying with no loans (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'REPAY_LOAN' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NO_LOANS_TO_REPAY');
  });

  it('starts a Bank auction with CALL_BANK', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'CALL_BANK', lotIndex: 0, bid: 3 });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.bank.auctions).toHaveLength(1);
    expect(updated.players[0]?.money).toBe(17); // $3 reserved
  });

  it('rejects CALL_BANK without a lotIndex (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'CALL_BANK', bid: 3 } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects LOAD_FROM_BANK when the ship is not at the Bank (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'LOAD_FROM_BANK' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SHIP_NOT_AT_BANK');
  });

  it('starts a cash-lot Bank auction (bidding containers)', async () => {
    const game = await createThreePlayerGame();
    // p1's starting factory container is white in the $2 lot.
    const response = await act(game.id, 'p1', {
      type: 'CALL_BANK',
      lotKind: 'cash',
      lotIndex: 0,
      containerBid: [{ color: 'white', price: 2 }],
    });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.bank.auctions[0]?.lotKind).toBe('cash');
    expect(updated.players[0]?.factoryStore).toEqual([]); // white reserved off the board
  });

  it('rejects BUILD_FACTORY without a color (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'BUILD_FACTORY' } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('BAD_ACTION');
  });

  it('rejects an unknown action type via schema (400)', async () => {
    const game = await createThreePlayerGame();
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions`,
      payload: { playerId: 'p1', action: { type: 'NONSENSE' } },
    });
    expect(response.statusCode).toBe(400);
  });

  it('ends a turn, advancing to the next player', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p1', { type: 'END_TURN' });
    expect(response.statusCode).toBe(200);
    const updated = response.json().game as GameState;
    expect(updated.activePlayerIndex).toBe(1);
    expect(updated.actionsRemaining).toBe(2);
  });

  it('rejects an action from a player whose turn it is not (409)', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'p2', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('NOT_YOUR_TURN');
  });

  it('rejects a third action in one turn (409)', async () => {
    const game = await createThreePlayerGame();
    await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    const third = await act(game.id, 'p1', { type: 'BUILD_WAREHOUSE' });
    expect(third.statusCode).toBe(409);
    expect(third.json().error.code).toBe('NO_ACTIONS_REMAINING');
  });

  it('returns 404 when acting in an unknown game', async () => {
    const response = await act('nope', 'p1', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(404);
  });

  it('projects an action reply for the acting client’s seats, not the next active player (B2)', async () => {
    const game = await createThreePlayerGame();
    // p1 ends their turn (active becomes p2). A client controlling seats p1 & p3 must not see p2's card.
    const response = await app.inject({
      method: 'POST',
      url: `/games/${game.id}/actions?viewer=p1,p3`,
      payload: { playerId: 'p1', action: { type: 'END_TURN' } },
    });
    const view = response.json().game as GameView;
    expect(view.activePlayerIndex).toBe(1); // p2 is now active…
    expect(view.players[1]!.scoringCard).toBeNull(); // …but p2's card is not leaked to this client
    expect(view.players[0]!.scoringCard).not.toBeNull(); // own seat
    expect(view.players[2]!.scoringCard).not.toBeNull(); // own seat
  });

  it('returns 404 for an unknown player', async () => {
    const game = await createThreePlayerGame();
    const response = await act(game.id, 'ghost', { type: 'PRODUCE' });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('PLAYER_NOT_FOUND');
  });
});

describe('GET /games/:id/stream (WebSocket, B2)', () => {
  it('sends an initial snapshot, then pushes a projected update on every action', async () => {
    const game = await createThreePlayerGame();
    const socket = await app.injectWS(`/games/${game.id}/stream`); // no viewer → follows the active player
    const next = reader(socket);

    // Initial snapshot: active is seat 0, so only p1's secret card is revealed.
    const initial = await next();
    expect(initial.type).toBe('state');
    expect(initial.game.version).toBe(0);
    expect(initial.game.players[0]!.scoringCard).not.toBeNull();
    expect(initial.game.players[1]!.scoringCard).toBeNull();

    // p1 ends their turn over REST; the socket receives a fresh push...
    await act(game.id, 'p1', { type: 'END_TURN' });
    const pushed = await next();
    expect(pushed.game.activePlayerIndex).toBe(1);
    // ...now projected for the new active player (seat 1), so the reveal follows the turn.
    expect(pushed.game.players[1]!.scoringCard).not.toBeNull();
    expect(pushed.game.players[0]!.scoringCard).toBeNull();

    socket.close();
  });

  it('pins the projection to a fixed seat when ?viewer is given', async () => {
    const game = await createThreePlayerGame();
    const socket = await app.injectWS(`/games/${game.id}/stream?viewer=p2`);
    const next = reader(socket);

    const initial = await next();
    // p2 always sees only their own card, even though seat 0 is active.
    expect(initial.game.players[1]!.scoringCard).not.toBeNull();
    expect(initial.game.players[0]!.scoringCard).toBeNull();

    await act(game.id, 'p1', { type: 'PRODUCE' });
    const pushed = await next();
    expect(pushed.game.version).toBe(1);
    expect(pushed.game.players[1]!.scoringCard).not.toBeNull();
    expect(pushed.game.players[0]!.scoringCard).toBeNull();

    socket.close();
  });

  it('closes the socket for an unknown game', async () => {
    const socket = await app.injectWS('/games/does-not-exist/stream');
    const [code] = (await once(socket, 'close')) as [number];
    expect(code).toBe(1008);
  });
});

describe('Lobbies (pre-game seat claiming)', () => {
  async function createLobby(seats?: number) {
    const response = await app.inject({ method: 'POST', url: '/lobbies', payload: seats ? { seats } : {} });
    expect(response.statusCode).toBe(201);
    return response.json().lobby as { id: string; seats: number; members: (string | null)[]; status: string };
  }

  const join = (id: string, name: string) =>
    app.inject({ method: 'POST', url: `/lobbies/${id}/join`, payload: { name } });

  it('creates an empty lobby with the requested number of seats', async () => {
    const lobby = await createLobby(4);
    expect(lobby.seats).toBe(4);
    expect(lobby.members).toEqual([null, null, null, null]);
    expect(lobby.status).toBe('open');
  });

  it('defaults to the 3-seat minimum and rejects out-of-range counts', async () => {
    expect((await createLobby()).seats).toBe(3);
    const tooFew = await app.inject({ method: 'POST', url: '/lobbies', payload: { seats: 2 } });
    expect(tooFew.statusCode).toBe(400);
    expect(tooFew.json().error.code).toBe('INVALID_SEAT_COUNT');
  });

  it('lets players claim seats by name, then starts a real game once full', async () => {
    const lobby = await createLobby(3);

    const first = await join(lobby.id, 'Tim');
    expect(first.statusCode).toBe(200);
    expect(first.json().seat).toBe(0);
    expect(first.json().lobby.members).toEqual([{ name: 'Tim', bot: false }, null, null]);

    await join(lobby.id, 'Sam');
    const third = await join(lobby.id, 'Lee');
    expect(third.json().seat).toBe(2);

    const started = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
    expect(started.statusCode).toBe(201);
    const game = started.json().game as GameView;
    expect(game.players.map((p) => p.name)).toEqual(['Tim', 'Sam', 'Lee']);

    // The lobby now points at the started game, and its code still resolves.
    const after = await app.inject({ method: 'GET', url: `/lobbies/${lobby.id}` });
    expect(after.json().lobby.status).toBe('started');
    expect(after.json().lobby.gameId).toBe(game.id);
  });

  it('lists open lobbies with a free seat, excluding full/started ones', async () => {
    const open = await createLobby(3);
    const partial = await createLobby(3);
    await join(partial.id, 'Solo'); // 1/3 — still open

    const full = await createLobby(3);
    await join(full.id, 'A');
    await join(full.id, 'B');
    await join(full.id, 'C');
    await app.inject({ method: 'POST', url: `/lobbies/${full.id}/start` }); // full + started

    const response = await app.inject({ method: 'GET', url: '/lobbies' });
    const ids = (response.json().lobbies as { id: string }[]).map((l) => l.id);
    expect(ids).toContain(open.id);
    expect(ids).toContain(partial.id);
    expect(ids).not.toContain(full.id);
  });

  it('refuses to start until every seat is filled', async () => {
    const lobby = await createLobby(3);
    await join(lobby.id, 'Tim');
    const notReady = await app.inject({ method: 'POST', url: `/lobbies/${lobby.id}/start` });
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json().error.code).toBe('LOBBY_NOT_READY');
  });

  it('rejects joining a full lobby and a missing lobby', async () => {
    const lobby = await createLobby(3);
    await join(lobby.id, 'A');
    await join(lobby.id, 'B');
    await join(lobby.id, 'C');
    const full = await join(lobby.id, 'D');
    expect(full.statusCode).toBe(409);
    expect(full.json().error.code).toBe('LOBBY_FULL');

    const missing = await join('does-not-exist', 'Z');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('LOBBY_NOT_FOUND');
  });
});

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
    const fetched = await app.inject({ method: 'GET', url: '/games/' + (await createWithBots([false, true, false])).game.id });
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
