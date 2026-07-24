import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import gamesConfig from '../../games.config';

/**
 * The C2 seam, enforced (Track D / D0: now driven by `games.config.ts`, the single source of truth).
 *
 * A static check rather than a browser test — it belongs with the UI's tests, and Playwright is the
 * UI's only runner. It's cheap, and the rule it guards is the one thing a refactor is most likely to
 * quietly undo: someone needs `COLORS` in a shell file, adds one import, and the "games room" is a
 * Container app again with nothing failing to say so.
 *
 * The rule: **the shell knows no game.** Everything a game understands lives under `src/games/<game>/`.
 * If a shell file needs a rule, a colour, a piece, or a seat count, that need belongs on the other side
 * of the seam (seat bounds, for instance, come from `GET /games/catalog`).
 */
const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

/** Where a game's own code is allowed to live. Everything else is the shell. */
const GAME_DIR = join(SRC, 'games');

/**
 * The in-repo game folders, derived from `games.config.ts` rather than the filesystem — so the check
 * follows the source of truth. A future package-shaped game (a bare-package `client` specifier) has no
 * folder here and is simply not listed; an in-repo folder that is *not* in the config is caught below.
 */
const CONFIG_GAME_FOLDERS = gamesConfig
  .map((entry) => entry.client)
  .filter((specifier) => specifier.startsWith('./'))
  .map((specifier) => specifier.replace(/^\.\//, ''));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

test('the shell imports no game engine', () => {
  const offenders = sourceFiles(SRC)
    .filter((path) => !path.startsWith(GAME_DIR))
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      // Match real imports only — these files *talk about* the rule in their comments. Catches every
      // engine subpath (`@game-hub/engine/container`, `/cantstop`, `/kernel`), not just the old bare id.
      return /^\s*import\s[^;]*from\s+'@game-hub\/engine(\/[^']*)?'/m.test(source);
    })
    .map((path) => path.slice(SRC.length + 1));

  expect(offenders, 'shell files must not import @game-hub/engine — move the need into games/<game>/').toEqual([]);
});

test('only the registry reaches into a game', () => {
  // Built from the config so every hosted game is covered (and a newly-added one can't slip the net).
  const gameFolderPattern = CONFIG_GAME_FOLDERS.join('|');
  const reachesIn = new RegExp(`^\\s*import\\s[^;]*from\\s+'[^']*games/(${gameFolderPattern})/`, 'm');
  const offenders = sourceFiles(SRC)
    .filter((path) => !path.startsWith(GAME_DIR))
    .filter((path) => path !== join(SRC, 'games', 'registry.ts'))
    .filter((path) => reachesIn.test(readFileSync(path, 'utf8')))
    .map((path) => path.slice(SRC.length + 1));

  expect(offenders, 'only games/registry.ts may name a specific game').toEqual([]);
});

test('every in-repo game folder is declared in games.config.ts', () => {
  // A folder under src/games/ that holds a client barrel but isn't in the config would never be
  // registered (the generated registry is built from the config), so the shell couldn't draw it — catch
  // it here rather than let it be a silently-dead folder.
  const declared = new Set(CONFIG_GAME_FOLDERS);
  const orphans = readdirSync(GAME_DIR)
    .filter((entry) => statSync(join(GAME_DIR, entry)).isDirectory())
    .filter((entry) => !declared.has(entry));

  expect(orphans, 'a game folder under src/games/ is missing from games.config.ts — add an entry').toEqual([]);
});
