import { lazy } from 'react';
import type { StoneAgeView } from '@game-hub/engine/stoneage';
import type { GameClient } from '../types';
import { GAME_TYPE } from './api';
import { StoneAgeStatus } from './Status';

/**
 * Stone Age, as a `GameClient` — the **bootstrap** (roadmap SA0). A read-only board for now; each stage
 * wires up its own controls. Lazy like the others, so the hub ships none of it until you enter a game.
 */
export const stoneAgeClient: GameClient<StoneAgeView> = {
  id: GAME_TYPE,
  name: 'Stone Age',
  blurb: 'A worker-placement game: send your people to gather resources, then build and trade your way up.',
  rules: [
    '2–4 players. Each round: place your people, use their actions, then feed them.',
    'Gather wood/brick/stone/gold and food by rolling dice at the board’s places (tools boost your rolls).',
    'Spend resources on buildings (instant points) and civilization cards (effects now, points at the end).',
    'The game ends when the card deck or a building stack runs out; most points wins.',
  ],
  Board: lazy(() => import('./Board')),
  Status: StoneAgeStatus,
};
