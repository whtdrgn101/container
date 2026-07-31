import type { Viewer } from './games';

/**
 * Presence — who is currently watching a game — derived entirely from the live-stream subscription
 * lifecycle (join / leave / heartbeat-reap all flow through `GameHub.subscribe`/unsubscribe). No polling
 * and no new persistence: the set of open sockets in a room *is* the presence set. The hub pushes a
 * `{ type: 'presence' }` envelope to the room on every change (see `hub.ts`).
 *
 * A viewer's **label** is the one game-shaped ingredient, so it is computed here (where a game's seat
 * names are known) and handed to the hub as an opaque string — the hub itself stays game-agnostic.
 */

/**
 * A human-readable label for a subscriber, from its viewer identity and the game's seat names:
 *
 * - a seat-bound viewer (`['p1']`, `['p1','p2']`) → that seat's name, or several joined with ` & `;
 * - a spectator (`[]`, an explicit empty viewer) → `'Spectator'`;
 * - hotseat / follow-active (`null`) → `'Table'` — one shared screen driving every seat, so there is no
 *   single seat to name.
 *
 * Falls back to the raw id for a seat with no matching name (a defensive default; every real seat has one).
 */
export function presenceLabel(
  viewer: Viewer,
  players: readonly { readonly id: string; readonly name: string }[],
): string {
  if (viewer === null) return 'Table';
  const ids = Array.isArray(viewer) ? viewer : [viewer];
  if (ids.length === 0) return 'Spectator';
  return ids.map((id) => players.find((player) => player.id === id)?.name ?? id).join(' & ');
}
