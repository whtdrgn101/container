// Saint Petersburg's `record()` is the shared kernel one verbatim — bump `version`, append one log
// entry — so it re-exports rather than re-implements (the shape is common across every game; see
// REVIEW.md §3.2). `record(state, type, playerId, changes?, payload?)`.
export { record } from '@game-hub/kernel';
