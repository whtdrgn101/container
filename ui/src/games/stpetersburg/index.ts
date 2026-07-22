import { lazy } from 'react';
import type { StPetersburgView } from '@game-hub/engine/stpetersburg';
import type { GameClient } from '../types';
import { GAME_TYPE } from './api';
import { StPetersburgStatus } from './Status';

/**
 * Saint Petersburg, as a `GameClient` (roadmap SP0–SP6) — the fourth game in the room. Its board plugs
 * into the same seam the other three use, driving the full game: the phase spine, hidden hand,
 * trading-card displacement, the six special cards, and final scoring.
 *
 * The board is **lazy** so the home screen doesn't ship it (it carries the Saint Petersburg engine
 * slice). Keep this file tiny — importing anything heavy here would defeat the point of the plugin being
 * lazy.
 */
export const stPetersburgClient: GameClient<StPetersburgView> = {
  id: GAME_TYPE,
  name: 'Saint Petersburg',
  blurb: 'A card-buying engine game: hire workers, raise buildings, and court aristocrats across four phases each round.',
  rules: [
    '2–4 players over ~7–10 rounds of four phases: worker → building → aristocrat → trading.',
    'On your turn buy a card, add one to your hidden hand, play one from hand, or pass.',
    'Workers earn rubles, buildings earn points, aristocrats earn both — cards of the phase’s type score each phase.',
    'Money and your hand are secret. Most points wins; ties break on money.',
  ],
  Board: lazy(() => import('./Board')),
  Status: StPetersburgStatus,
};
