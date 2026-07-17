import { lazy } from 'react';
import type { CantStopView } from '@game-hub/engine/cantstop';
import type { GameClient } from '../types';
import { GAME_TYPE } from './api';
import { CantStopStatus } from './Status';

/**
 * Can't Stop, as a `GameClient` (roadmap C3) — the second game in the room, and the proof the shell
 * really is game-agnostic: a completely different board plugs into the same seam Container uses.
 *
 * The board is **lazy** so the home screen doesn't ship it (it carries the Can't Stop engine slice).
 * Keep this file tiny — importing anything heavy here would defeat the point of the plugin being lazy.
 */
export const cantstopClient: GameClient<CantStopView> = {
  id: GAME_TYPE,
  name: "Can't Stop",
  blurb: 'A push-your-luck dice game: climb the number columns, but bank your progress before you bust.',
  rules: [
    '2–4 players. Roll four dice and split them into two column sums.',
    'Advance up to three runners up those columns; keep rolling to climb higher.',
    'If a roll can’t advance anything, you bust and lose this turn’s progress.',
    'Stop to bank your runners as permanent squares. First to the top of three columns wins.',
  ],
  Board: lazy(() => import('./Board')),
  Status: CantStopStatus,
};
