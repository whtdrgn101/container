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

test('the shell imports no game engine or game package', () => {
  const offenders = sourceFiles(SRC)
    .filter((path) => !path.startsWith(GAME_DIR))
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      // Match real imports only — these files *talk about* the rule in their comments. Catches every
      // engine subpath (`@game-hub/engine/container`, `/stoneage`, `/kernel`) AND every Track D game
      // **package** (`@game-hub/game-cantstop/client`, `@game-hub/game-russianrailroads/client`) — once
      // a game lives in its own package, a shell file reaching for it is the same seam breach as the old
      // bare-engine import. Only the generated registry (under `src/games/`, excluded above) may name one.
      return /^\s*import\s[^;]*from\s+'@game-hub\/(engine(\/[^']*)?|game-[^']*)'/m.test(source);
    })
    .map((path) => path.slice(SRC.length + 1));

  expect(
    offenders,
    'shell files must not import @game-hub/engine or a @game-hub/game-* package — move the need into games/<game>/',
  ).toEqual([]);
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

/**
 * The other half of the seam, added in Track D / D2b: **no game package may import the host's UI.**
 *
 * The shell-side rule above stops the hub learning a game; this one stops a game learning the *hub*. A
 * game package's `./client` may import `@game-hub/kernel/client` (the contract + transport DTOs) and
 * `@game-hub/ui-kit` (the shared chrome + the game-facing REST calls) — and nothing else from this repo.
 * The moment it reaches `@/…` or `ui/src`, the package stops being installable from `node_modules`, which
 * is the entire point of D2 (design doc "contract gap #1").
 *
 * It fails silently in every other check — the `@` alias resolves fine in-workspace, so typecheck, tests
 * and the build are all green while the package is quietly unpublishable. Hence a static test.
 */
const GAME_PACKAGES = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'packages', 'games');

test('no game package reaches into the UI shell', () => {
  const games = readdirSync(GAME_PACKAGES).filter((entry) => statSync(join(GAME_PACKAGES, entry)).isDirectory());
  // `@/…` (the shell's path alias) or any relative/absolute climb into `ui/src`.
  const reachesShell = /^\s*(import|export)\s[^;]*from\s+'(@\/[^']*|[^']*\bui\/src\/[^']*)'/m;
  const offenders = games.flatMap((game) => {
    const src = join(GAME_PACKAGES, game, 'src');
    return sourceFiles(src)
      .filter((path) => reachesShell.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(GAME_PACKAGES.length + 1));
  });

  expect(
    offenders,
    "a game package must not import ui/src — use '@game-hub/ui-kit' (chrome, REST) or '@game-hub/kernel/client' (contract, DTOs)",
  ).toEqual([]);
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
