import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { legalActions, SEAT_COLORS, START_CORNERS } from '@game-hub/game-labyrinth/engine';
import type { Action, LabyrinthState, LabyrinthView } from '@game-hub/game-labyrinth/engine';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';

/**
 * Labyrinth over REST — the Track D / D2d proof, and a different one from every test beside it.
 *
 * Every other game in this suite is a **workspace package consumed as TypeScript source**. Labyrinth is
 * built in its own repository (github.com/whtdrgn101/game-labyrinth, the D2c pilot) and installed here
 * as a packed tarball whose `exports` resolve to compiled `dist/` — the same artefact an npm consumer
 * would get. So this file is the honest answer to "can the core host a game it did not compile?", the
 * question `module-seam.test.ts` can only ask with an in-repo stub.
 *
 * What it drives, deliberately end-to-end through the *core's* routes (there are no Labyrinth-specific
 * endpoints — all the randomness is spent at setup, so `/actions` is the whole surface):
 *
 *  - the catalog entry (seat bounds and the four pawn colours the module declares),
 *  - the **colour channel** (kernel 1.2.0): a lobby pick becomes the corner the pawn starts on — this
 *    game is the reason that channel exists (the game repo's `docs/d2c-findings.md` §16),
 *  - a full turn — the compulsory slide, then the move — with the version incrementing per action,
 *  - and the redaction on the wire: your own stack is projected to its top card, everyone else's to a
 *    bare count (rulebook pg. 2).
 */
describe('Labyrinth over REST — a game package built outside this repo', () => {
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
    const response = await app.inject({ method: 'POST', url: '/games', payload: { gameType: 'labyrinth', players } });
    expect(response.statusCode).toBe(201);
    return response.json() as { game: LabyrinthState; gameType: string };
  };

  const read = async (id: string, viewer?: string) =>
    (
      await app.inject({ method: 'GET', url: `/games/${id}${viewer === undefined ? '' : `?viewer=${viewer}`}` })
    ).json() as { game: LabyrinthView };

  const act = (id: string, playerId: string, action: Action, expectedVersion?: number) =>
    app.inject({
      method: 'POST',
      url: `/games/${id}/actions`,
      payload: { playerId, action, ...(expectedVersion === undefined ? {} : { expectedVersion }) },
    });

  it('appears in the catalog with its seat bounds and its four pawn colours', async () => {
    const catalog = (await app.inject({ method: 'GET', url: '/games/catalog' })).json().games as {
      id: string;
      name: string;
      minPlayers: number;
      maxPlayers: number;
      colors: string[];
    }[];
    const labyrinth = catalog.find((game) => game.id === 'labyrinth');
    expect(labyrinth).toBeDefined();
    expect(labyrinth!.name).toBe('Labyrinth');
    expect(labyrinth!.minPlayers).toBe(2);
    expect(labyrinth!.maxPlayers).toBe(4);
    // Rules data, not a tint: each id names the corner its holder starts on and must return to.
    expect(labyrinth!.colors).toEqual([...SEAT_COLORS]);
  });

  it('honours a seat’s colour pick as the corner it starts on (kernel 1.2.0’s colour channel)', async () => {
    const { game } = await create([{ name: 'Ann', color: 'yellow' }, { name: 'Bob' }]);
    expect(game.players[0]!.color).toBe('yellow');
    expect(game.players[0]!.position).toEqual(START_CORNERS.yellow);
    // The seat that picked nothing is filled from the palette, skipping the taken colour.
    expect(game.players[1]!.position).toEqual(START_CORNERS[game.players[1]!.color]);
    expect(game.players[1]!.color).not.toBe('yellow');
  });

  it('plays a turn — slide then move — with the version incrementing per action', async () => {
    const { game } = await create([{ name: 'Ann' }, { name: 'Bob' }]);
    const seat = game.players[0]!.id;
    expect(game.version).toBe(0);
    expect(game.phase).toBe('insert');

    // The compulsory slide (pg. 2). `expectedVersion` is the platform's optimistic-concurrency guard.
    const insert = legalActions(game, seat).find((action) => action.type === 'INSERT')!;
    const slid = await act(game.id, seat, insert, 0);
    expect(slid.statusCode).toBe(200);
    const afterInsert = slid.json().game as LabyrinthView;
    expect(afterInsert.version).toBe(1);
    expect(afterInsert.phase).toBe('move');

    // Then the walk. "Stay where you are" is itself a MOVE to your own square (game ROADMAP ruling 11),
    // so there is always at least one legal move and the turn can always end.
    const move = legalActions(afterInsert as unknown as LabyrinthState, seat).find((a) => a.type === 'MOVE')!;
    const moved = await act(game.id, seat, move, 1);
    expect(moved.statusCode).toBe(200);
    const afterMove = moved.json().game as LabyrinthView;
    expect(afterMove.version).toBe(2);
    expect(afterMove.phase).toBe('insert');
    expect(afterMove.players[afterMove.activePlayerIndex]!.id).toBe(game.players[1]!.id);

    // Two moves logged, both public — the log is what the activity feed narrates to every seat.
    expect(afterMove.log.map((entry) => entry.type)).toEqual(['INSERT', 'MOVE']);

    // The core still refuses a stale write, exactly as it does for an in-repo game.
    expect((await act(game.id, game.players[1]!.id, insert, 1)).statusCode).toBe(409);
  });

  it('redacts each seat’s treasure stack on the wire, per viewer', async () => {
    const { game } = await create([{ name: 'Ann' }, { name: 'Bob' }]);
    const [ann, bob] = game.players as unknown as { id: string }[];

    const asAnn = await read(game.id, ann!.id);
    expect(asAnn.game.players[0]!.stack).toHaveLength(1); // my own: the top card only (pg. 2)
    expect(asAnn.game.players[1]!.stack).toBeNull(); // an opponent's: not at all
    expect(asAnn.game.players[1]!.stackCount).toBeGreaterThan(0);

    // …and the projection follows the viewer, which is the property a shared screen depends on.
    const asBob = await read(game.id, bob!.id);
    expect(asBob.game.players[1]!.stack).toHaveLength(1);
    expect(asBob.game.players[0]!.stack).toBeNull();

    // `?viewer=` (present but empty) is the spectator: nobody's cards, not even the active seat's.
    const asSpectator = await read(game.id, '');
    expect(asSpectator.game.players.every((player) => player.stack === null)).toBe(true);

    // An *omitted* viewer follows the active player instead (the hotseat projection, `app.ts`), which
    // for a fresh game is seat 0 — so the hotseat screen shows exactly the seat on the clock.
    const hotseat = await read(game.id);
    expect(hotseat.game.players[0]!.stack).toHaveLength(1);
    expect(hotseat.game.players[1]!.stack).toBeNull();
  });
});
