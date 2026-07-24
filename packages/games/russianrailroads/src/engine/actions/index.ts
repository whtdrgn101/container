// Actions barrel — the turn-aware entry point, the mechanics, and legal-move enumeration.
export type { Action, ActionType } from './action';
export { applyAction } from './applyAction';
export { legalActions } from './legalActions';
export { place } from './place';
export { moveTrack } from './moveTrack';
export { flipLoco, placeLoco, replaceLoco } from './locomotive';
export { placeFactory, replaceFactory } from './factory';
export { resolvePool, skipPool } from './pool';
export { pass } from './pass';
