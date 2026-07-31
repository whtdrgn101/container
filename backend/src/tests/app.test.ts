import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Action, GameState, GameView } from '@game-hub/game-container/engine';
import type { StateMessage } from '../hub';
import { newApp, wsReader } from './helpers';

/**
 * The core Game Hub REST surface, driven through Container: creating and reading games, per-viewer
 * redaction (B1), seat identity on every payload (§3.3), applying actions, the push-only live stream
 * (B2), and the pre-game lobby flow. Container's game-specific *module* concerns — its delivery
 * auctions and the bot-seat platform — live in `auctions.test.ts` and `botSeats.test.ts`.
 */

let app: FastifyInstance;

beforeEach(async () => {
  ({ app } = await newApp());
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
    const summary = (
      response.json().games as { id: string; players: { id: string; name: string }[]; activePlayerId: string }[]
    ).find((g) => g.id === game.id)!;
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

describe('Game payload seat identity (REVIEW §3.3)', () => {
  // Shape asserted structurally so a game that named its seats differently can't quietly satisfy it.
  interface IdentityPayload {
    players: { id: string; name: string }[];
    activePlayerId: string | null;
  }

  it('carries players + activePlayerId on the create response', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
    });
    const body = response.json() as IdentityPayload;
    expect(body.players).toEqual([
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Cid' },
    ]);
    expect(body.activePlayerId).toBe('p1');
  });

  it('carries the same identity on GET', async () => {
    const game = await createThreePlayerGame();
    const body = (await app.inject({ method: 'GET', url: `/games/${game.id}` })).json() as IdentityPayload;
    expect(body.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cid']);
    expect(body.activePlayerId).toBe('p1');
  });

  it('advances activePlayerId on the POST /actions reply as the turn moves', async () => {
    const game = await createThreePlayerGame();
    const body = (await act(game.id, 'p1', { type: 'END_TURN' })).json() as IdentityPayload;
    expect(body.activePlayerId).toBe('p2');
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
    // Secret-free seat identity rides the push too (§3.3), so the shell needn't read `game`.
    expect(initial.players.map((p) => p.name)).toEqual(['Ann', 'Bob', 'Cid']);
    expect(initial.activePlayerId).toBe('p1');

    // p1 ends their turn over REST; the socket receives a fresh push...
    await act(game.id, 'p1', { type: 'END_TURN' });
    const pushed = await next();
    expect(pushed.game.activePlayerIndex).toBe(1);
    expect(pushed.activePlayerId).toBe('p2'); // identity follows the turn
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
