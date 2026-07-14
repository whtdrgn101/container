import type { Color } from './colors';

/**
 * Everything a player can choose to do. `applyAction` is the turn-aware entry point that
 * validates and applies these. PRODUCE / BUILD_* cost one action; END_TURN ends the turn.
 */
export type Action =
  | { readonly type: 'PRODUCE'; readonly select?: readonly Color[] }
  | { readonly type: 'BUILD_FACTORY'; readonly color: Color }
  | { readonly type: 'BUILD_WAREHOUSE' }
  | { readonly type: 'END_TURN' };

export type ActionType = Action['type'];
