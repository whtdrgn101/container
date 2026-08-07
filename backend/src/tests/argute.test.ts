import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MAX_PLAYERS, SEAT_COLORS, TRICK_SIZES } from '@game-hub/game-argute/engine';
import type { Action, ArguteState, ArguteView } from '@game-hub/game-argute/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Argute over REST — game 7, and the first built from `whtdrgn101/game-template` rather than extracted
 * from this workspace or hand-built like Labyrinth. Installed as compiled `dist/`; nothing here compiles
 * it.
 *
 * Two things make it worth a file of its own rather than a line in `module-seam.test.ts`:
 *
 *  1. **It seats seven.** Every game before it stopped at five, so this is the first time the core, the
 *     colour assignment and `MAX_SEATS` are driven at the top of their range.
 *  2. **It has two secrets, and one of them is a bid.** The projection has to hide every other seat's
 *     six cards *and* their face-down bid card until the hand scores (the game repo's ruling R2) — and,
 *     because everything the engine logs is public, the bid value must be absent from the **move log**
 *     too, not merely from the view. Redacting only the view would leak it on the wire.
 */
describe('Argute over REST — seven seats and two secrets', () => {
  let db: DB;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = createDatabase();
    app = buildApp({ db });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    db.close();
  });

  const create = async (players: { name: string; color?: string }[]) => {
    const response = await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'argute', players } });
    expect(response.statusCode).toBe(201);
    return response.json() as { game: ArguteState };
  };

  const read = async (id: string, viewer?: string) =>
    (
      await app.inject({ method: 'GET', url: `/games/${id}${viewer === undefined ? '' : `?viewer=${viewer}`}` })
    ).json() as { game: ArguteView };

  const act = (id: string, playerId: string, action: Action) =>
    app.inject({ method: 'POST', url: `/games/${id}/actions`, payload: { playerId, action } });

  const sevenNames = ['Ann', 'Bob', 'Cid', 'Dee', 'Eve', 'Fay', 'Gus'].map((name) => ({ name }));

  it('appears in the catalog with its seven-seat bounds and its seven peg colours', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
    }[];
    const argute = catalog.find((game) => game.id === 'argute')!;
    expect([argute.minPlayers, argute.maxPlayers]).toEqual([2, 7]);
    // The palette is the seven pegs that are physically in the box, and it must cover `maxPlayers` —
    // `assignColors` falls back to `palette[0]` (colliding) if it ever runs short.
    expect(argute.colors).toEqual([...SEAT_COLORS]);
    expect(argute.colors).toHaveLength(MAX_PLAYERS);
  });

  it('deals a seven-seat table — the widest the hub hosts — six cards to each seat', async () => {
    const { game } = await create(sevenNames);
    expect(game.players).toHaveLength(7);
    const view = (await read(game.id, 'p1')).game;
    expect(view.players.map((p) => p.handCount)).toEqual([6, 6, 6, 6, 6, 6, 6]);
    // Seven seats at six cards is the entire 42-card deck, so nothing is held back (ruling R4 has no
    // remainder to hide at this seat count).
    expect(view.players.reduce((total, p) => total + p.handCount, 0)).toBe(42);
  });

  it('hides every other seat’s cards and bid, and keeps the bid value out of the public log', async () => {
    const { game } = await create(sevenNames.slice(0, 3));
    const [first] = game.players;

    // Before anything: you see your own six cards, nobody else's.
    const dealt = (await read(game.id, first!.id)).game;
    expect(dealt.players[0]!.hand).toHaveLength(6);
    expect(dealt.players[1]!.hand).toBeNull();
    expect(dealt.players[2]!.hand).toBeNull();

    // The active seat bids. Bidding runs in seat order and the value stays face-down (rulings R2/R3).
    const bidder = game.players[dealt.activePlayerIndex]!;
    expect((await act(game.id, bidder.id, { type: 'BID', bid: 3 } as Action)).statusCode).toBe(200);

    const afterBid = (await read(game.id, bidder.id)).game;
    const mine = afterBid.players.find((p) => p.id === bidder.id)!;
    const theirs = afterBid.players.filter((p) => p.id !== bidder.id);
    expect(mine.bid).toBe(3);
    expect(mine.hasBid).toBe(true);
    // Someone else reading the same game sees that a card is down, never which one.
    const asOther = (await read(game.id, theirs[0]!.id)).game;
    expect(asOther.players.find((p) => p.id === bidder.id)!.bid).toBeNull();
    expect(asOther.players.find((p) => p.id === bidder.id)!.hasBid).toBe(true);

    // ⚠️ The log is public regardless of `viewFor`, so the bid value must never have been recorded.
    // A spectator is the strictest reader there is — and it is `?viewer=` *empty*, not an absent
    // `viewer`: with no query at all the core deliberately follows the active player for hotseat
    // (`viewerFrom` in services.ts), which is a seat-holder's view, not a bystander's.
    const spectator = (await read(game.id, '')).game;
    expect(JSON.stringify(spectator.log)).not.toContain('"bid"');
    expect(spectator.players.every((p) => p.hand === null)).toBe(true);
    expect(spectator.players.every((p) => p.bid === null)).toBe(true);
  });

  it('takes exactly the trick’s worth of cards and rejects a card the seat does not hold', async () => {
    const { game } = await create(sevenNames.slice(0, 2));
    // Bidding runs in seat order from the dealer's left (ruling R3), so ask the game whose turn it is
    // rather than assuming — bidding out of order is a 409, and swallowing it would leave the hand stuck.
    for (let i = 0; i < game.players.length; i += 1) {
      const current = (await read(game.id, '')).game;
      const seat = game.players[current.activePlayerIndex]!;
      expect((await act(game.id, seat.id, { type: 'BID', bid: 1 } as Action)).statusCode).toBe(200);
    }

    const playing = (await read(game.id, 'p1')).game;
    expect(playing.phase).toBe('playing');
    const leader = game.players[playing.activePlayerIndex]!;
    const hand = (await read(game.id, leader.id)).game.players.find((p) => p.id === leader.id)!.hand!;

    // Trick 1 takes exactly three cards; two is a bad request, not a silent partial play.
    const short = await act(game.id, leader.id, { type: 'PLAY', cards: hand.slice(0, 2) } as Action);
    expect(short.statusCode).toBe(400);
    expect(short.json().error.code).toBe('WRONG_CARD_COUNT');

    // And a denomination the seat doesn't hold is refused by count, not by identity (ruling R8).
    const absent = [0, 1, 2, 3, 4, 5].find((card) => !hand.includes(card as never));
    if (absent !== undefined) {
      const bogus = await act(game.id, leader.id, {
        type: 'PLAY',
        cards: [absent, ...hand.slice(0, 2)],
      } as Action);
      expect(bogus.statusCode).toBe(400);
      expect(bogus.json().error.code).toBe('CARD_NOT_IN_HAND');
    }

    const played = await act(game.id, leader.id, { type: 'PLAY', cards: hand.slice(0, TRICK_SIZES[0]) } as Action);
    expect(played.statusCode).toBe(200);
    expect((await read(game.id, leader.id)).game.players.find((p) => p.id === leader.id)!.hand).toHaveLength(3);
  });
});
