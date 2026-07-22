import type { DB } from './db';

/**
 * Which colour each seat picked (the feature: players pick their own player-colour).
 *
 * Coordination state, exactly like bots and lobbies: **the engine never learns a colour.** A colour
 * is presentation — a per-seat tint the boards paint meeples / hulls / ribbons / dots with — never a
 * rule, so it rides *beside* the game (its own table, its own repository), the same pattern as
 * `bots.ts`. The available palette belongs to the game's `GameModule` (`colors`); this only records
 * which id a seat ended up with.
 */
export class ColorRepository {
  constructor(private readonly db: DB) {}

  /** Record the colour for each seat in a game. Replaces any existing set. */
  setForGame(gameId: string, colors: Readonly<Record<string, string>>): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO game_colors (game_id, player_id, color) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM game_colors WHERE game_id = ?').run(gameId);
      for (const [playerId, color] of Object.entries(colors)) {
        insert.run(gameId, playerId, color);
      }
    })();
  }

  /** The colour each seat holds in a game, as `{ playerId: colorId }`. Empty for a game with no rows. */
  listForGame(gameId: string): Record<string, string> {
    const rows = this.db
      .prepare('SELECT player_id, color FROM game_colors WHERE game_id = ?')
      .all(gameId) as { player_id: string; color: string }[];
    return Object.fromEntries(rows.map((row) => [row.player_id, row.color]));
  }
}

/**
 * Assign a colour to every seat from a game's palette: honour the picks that are valid and unique,
 * then fill each remaining seat with the first still-free palette colour, in order.
 *
 * Pure and game-agnostic (the palette is the module's; the picks are per seat). The two-pass shape is
 * what makes the default assignment reproduce today's seat-order tints: with no picks at all, seat `i`
 * gets `palette[i]`, which is exactly the old per-seat-index colouring — so visual baselines don't move.
 *
 * A pick that isn't in the palette, or duplicates an earlier seat's pick, is dropped rather than
 * trusted (it then falls through to a free colour), so a bad `POST /games` body can't hand two seats
 * the same colour. Defensively falls back to `palette[0]` if the palette is somehow shorter than the
 * seat count (our palettes always cover `maxPlayers`, so that path is unreachable in practice).
 */
export function assignColors(palette: readonly string[], picks: readonly (string | undefined)[]): string[] {
  const used = new Set<string>();
  const honoured = picks.map((pick) => {
    if (pick !== undefined && palette.includes(pick) && !used.has(pick)) {
      used.add(pick);
      return pick;
    }
    return undefined;
  });
  return honoured.map((color) => {
    if (color !== undefined) return color;
    const free = palette.find((candidate) => !used.has(candidate));
    if (free !== undefined) {
      used.add(free);
      return free;
    }
    return palette[0] ?? '';
  });
}

/**
 * Colours for every seat, reading the stored picks and synthesising defaults for any seat without one.
 *
 * Old games (created before this feature, so with no `game_colors` rows) come back fully coloured by
 * palette order — nothing on the wire ever sees a seat with no colour. Runs `assignColors` over the
 * stored picks, so a partially-stored game is completed consistently and can't collide.
 */
export function colorsForSeats(
  palette: readonly string[],
  playerIds: readonly string[],
  stored: Readonly<Record<string, string>>,
): Record<string, string> {
  const assigned = assignColors(
    palette,
    playerIds.map((id) => stored[id]),
  );
  return Object.fromEntries(playerIds.map((id, i) => [id, assigned[i]!]));
}
