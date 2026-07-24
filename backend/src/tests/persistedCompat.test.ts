import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createGame as createContainer } from '@game-hub/engine/container';
import { createGame as createCantStop } from '@game-hub/engine/cantstop';
import { createGame as createStoneAge } from '@game-hub/engine/stoneage';
import { buildApp } from '../app';
import { createDatabase } from '../db';
import type { DB } from '../db';
import { cantStopModule, containerModule, stoneAgeModule } from '../games';
import { GameRepository } from '../repository';

/**
 * Persisted-data compatibility for the end-state discriminated union (REVIEW.md §3.1).
 *
 * The union removed `results`/`winnerIds` from the **active** arm of every game's state, so `createGame`
 * no longer emits them. But games persisted before this change carry those legacy keys on disk — an
 * active Container/Stone Age blob has a stale `results: []` / `results: null` and `winnerIds: []`, an
 * active Can't Stop blob a stale `winnerIds: []`. At runtime a TypeScript union is nothing — the JSON
 * simply has extra properties — so these must load, play, and summarize with **no migration**. This
 * suite proves it by seeding real old-shape blobs through the repository (the module path) and driving
 * them over REST exactly as a live server would after a deploy onto an existing `/data` volume.
 */
let app: FastifyInstance;
let db: DB;
let repo: GameRepository;

beforeEach(async () => {
  db = createDatabase(':memory:');
  app = buildApp({ db });
  repo = new GameRepository(db);
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('end-state union — persisted-data compatibility (no migration)', () => {
  it('plays an action on an old-shape ACTIVE Container blob carrying stale results/winnerIds', async () => {
    // A blob written by the *pre-union* engine: an active game that still has the empty end-state keys.
    const modern = createContainer({
      id: 'legacy-active',
      players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    const legacyBlob = { ...modern, results: [], winnerIds: [] };
    expect('results' in legacyBlob).toBe(true); // the exact shape an old database holds
    repo.create(containerModule, legacyBlob);

    // The move path (moduleOf → applyAction → repo.update → summarize → viewFor) must not care.
    const res = await app.inject({
      method: 'POST',
      url: '/games/legacy-active/actions',
      payload: { playerId: 'p1', action: { type: 'PRODUCE' } },
    });
    expect(res.statusCode).toBe(200);
    const game = res.json().game as { version: number; status: string };
    expect(game.version).toBeGreaterThan(0); // the action applied
    expect(game.status).toBe('active');

    // And it still reads back cleanly.
    const got = await app.inject({ method: 'GET', url: '/games/legacy-active?viewer=p1' });
    expect(got.statusCode).toBe(200);
    expect((got.json().game as { status: string }).status).toBe('active');
  });

  it('renders a summary for an old-shape ENDED Container blob (real results/winnerIds)', async () => {
    // An old ended blob carried genuine values — the union changed nothing about the ended arm.
    const modern = createContainer({
      id: 'legacy-ended',
      players: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }],
    });
    const endedBlob = {
      ...modern,
      status: 'ended' as const,
      winnerIds: ['p1'],
      results: [
        { playerId: 'p1', cash: 30, islandScore: 0, leftover: 0, loanPenalty: 0, total: 30, discardedColor: null },
        { playerId: 'p2', cash: 20, islandScore: 0, leftover: 0, loanPenalty: 0, total: 20, discardedColor: null },
        { playerId: 'p3', cash: 10, islandScore: 0, leftover: 0, loanPenalty: 0, total: 10, discardedColor: null },
      ],
    };
    repo.create(containerModule, endedBlob);

    // The resume list computes `summarize` on every row (then filters ended ones out); it must not throw
    // on the ended blob — proof the summary path handles it. And the row is correctly excluded.
    const list = await app.inject({ method: 'GET', url: '/games' });
    expect(list.statusCode).toBe(200);
    expect((list.json().games as { id: string }[]).some((g) => g.id === 'legacy-ended')).toBe(false);

    // Fetching it directly still renders, ended, with its results revealed.
    const got = await app.inject({ method: 'GET', url: '/games/legacy-ended' });
    expect(got.statusCode).toBe(200);
    const game = got.json().game as { status: string; winnerIds: string[]; results: unknown[] };
    expect(game.status).toBe('ended');
    expect(game.winnerIds).toEqual(['p1']);
    expect(game.results).toHaveLength(3);
  });

  it("summarizes all three games' legacy ACTIVE shapes (the three ways the old code disagreed)", async () => {
    // Each game's *pre-union* active blob, reconstructed exactly:
    //  - Container: results: []      (empty array while active)
    //  - Stone Age: results: null    (null while active)
    //  - Can't Stop: no results at all, just winnerIds: []
    repo.create(containerModule, {
      ...createContainer({ id: 'c-legacy', players: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }),
      results: [],
      winnerIds: [],
    });
    repo.create(stoneAgeModule, {
      ...createStoneAge({ id: 's-legacy', players: [{ name: 'A' }, { name: 'B' }] }),
      results: null,
      winnerIds: [],
    });
    repo.create(cantStopModule, {
      ...createCantStop({ id: 'k-legacy', players: [{ name: 'A' }, { name: 'B' }] }),
      winnerIds: [],
    });

    // All three summarize without a migration and appear on the resume list (all still active).
    const list = await app.inject({ method: 'GET', url: '/games' });
    expect(list.statusCode).toBe(200);
    const ids = (list.json().games as { id: string; status: string }[]).map((g) => g.id);
    expect(ids).toEqual(expect.arrayContaining(['c-legacy', 's-legacy', 'k-legacy']));
  });
});
