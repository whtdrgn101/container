/**
 * Who a per-player state projection is built for: a single seat, several seats (one client holding
 * many, as in hotseat), or none (`null`/`[]` — a spectator with no cards).
 *
 * Game-agnostic: every game's `viewFor(state, viewer)` redacts against the same notion of a viewer,
 * even a game like Can't Stop that has nothing to hide. The backend seam shares this type directly.
 */
export type Viewer = string | readonly string[] | null;
