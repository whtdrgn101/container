// The engine kernel: the small set of primitives every game shares. Deliberately tiny — this is not
// a game framework. Rules, state shapes and the `record()` mechanism stay inside each game folder;
// only what is genuinely cross-game (and mirrored by the backend's `GameModule` contract) lives here.
export { GameError } from './errors';
export type { MoveRecord } from './moveRecord';
export type { Viewer } from './viewer';
