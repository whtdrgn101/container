import { lazy } from 'react';
import type { GameView } from '@game-hub/engine/container';
import type { GameClient } from '../types';
import { GAME_TYPE } from './api';
import { ContainerStatus } from './Status';

/**
 * Container, as a `GameClient` (roadmap C2) — the first game in the room.
 *
 * The board is **lazy** so the home screen doesn't ship it: it drags in the whole engine, every panel
 * and the board art, none of which anyone browsing the hub needs. That is the point of the plugin
 * being a plugin, and it's why this file stays tiny — importing anything heavy here would defeat it.
 * (`blurb`/`rules` are cheap strings, so the landing can show them without loading the board.)
 */
export const containerClient: GameClient<GameView> = {
  id: GAME_TYPE,
  name: 'Container',
  blurb: 'An economic supply-chain game — where you can never buy or ship your own goods.',
  rules: [
    '3–5 players. Take 2 actions on your turn.',
    'Produce goods, then sell them down the chain: to an opponent’s harbor, onto their ship, to the island.',
    'Delivered cargo is auctioned — the deliverer earns the winning bid plus a matching government subsidy.',
    'Everyone has a secret scoring card. When two colors run out the game ends; highest total wins.',
  ],
  Board: lazy(() => import('./Board')),
  Status: ContainerStatus,
};

// The package-contract entry point (Track D / D0): the generated registry imports each game's client
// as a default. Still tiny/non-lazy — the default is the same light object, board import unchanged.
export default containerClient;
