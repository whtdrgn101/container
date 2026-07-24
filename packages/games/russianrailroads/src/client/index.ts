import { lazy } from 'react';
import type { RussianRailroadsView } from '../engine';
import { GAME_TYPE } from './api';
import { RussianRailroadsStatus } from './Status';
import type { GameClient } from './types';

/**
 * Russian Railroads, as a `GameClient` (RR1) — the **fifth** game in the room and the **Track D pilot**:
 * the first client shipped from its own in-workspace package. Its board plugs into the same seam the
 * in-repo games use.
 *
 * The board is **lazy** so the home screen doesn't ship it (it carries the Russian Railroads engine
 * slice). Keep this file tiny — importing anything heavy here would defeat the point of the plugin being
 * lazy.
 */
const russianRailroadsClient: GameClient<RussianRailroadsView> = {
  id: GAME_TYPE,
  name: 'Russian Railroads',
  blurb:
    'A worker-placement Euro: send workers to build three rail routes, buy locomotives, industrialize, and hire engineers over seven rounds.',
  rules: [
    '2–4 players over 7 rounds (6 at 2–3 players).',
    'On your turn, place workers on an unoccupied action space and resolve it, or pass for the round.',
    'Coins can stand in for workers; a passed player is done until the round ends.',
    'When everyone has passed, the round scores and the engineer strip slides on. Most points wins.',
  ],
  Board: lazy(() => import('./Board')),
  Status: RussianRailroadsStatus,
};

// The package-contract entry point (Track D): the generated registry imports each game's client as a
// default.
export default russianRailroadsClient;
