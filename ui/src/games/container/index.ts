import { lazy } from 'react';
import type { GameView } from '@container/engine/container';
import type { GameClient } from '../types';
import { GAME_TYPE } from './api';
import { ContainerStatus } from './Status';

/**
 * Container, as a `GameClient` (roadmap C2) — the first game in the room, and for now the only one.
 *
 * The board is **lazy** so the home screen doesn't ship it: it drags in the whole engine, every panel
 * and the board art, none of which anyone browsing the hub needs. That is the point of the plugin
 * being a plugin, and it's why this file stays tiny — importing anything heavy here would defeat it.
 */
export const containerClient: GameClient<GameView> = {
  id: GAME_TYPE,
  name: 'Container',
  Board: lazy(() => import('./Board')),
  Status: ContainerStatus,
};
