// The engine kernel: the small set of primitives every game shares. Deliberately tiny — this is not
// a game framework. Game *rules* and *state shapes* stay inside each game folder; only what turned out
// genuinely cross-game lives here: the error type, the move-record/viewer shapes, the end-state
// discriminated union (REVIEW.md §3.1), and — once a third game proved them identical (REVIEW.md §3.2)
// — the `record()` version/log mechanism and the seat helpers. Extract on the third example, not the
// first; resist the coincidental (see `viewFor`).
export { GameError } from './errors';
export type { MoveRecord } from './moveRecord';
export type { Viewer } from './viewer';
export { record } from './record';
export type { VersionedState } from './record';
export { makeSeating } from './seating';
export type { SeatedState, SeatHelpers } from './seating';
export type { GameEndState, WinnersEndState } from './endState';
