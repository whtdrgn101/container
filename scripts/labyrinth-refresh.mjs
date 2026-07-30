#!/usr/bin/env node
/**
 * Refresh the vendored Labyrinth tarball (Track D / D2d) — `pnpm labyrinth:refresh`.
 *
 * Labyrinth is the first game hosted from **outside** this monorepo (`../game-labyrinth`, the D2c
 * pilot). It is not a workspace package and it is not on npm yet, so the hub depends on a **packed
 * tarball committed under `vendor/`** — see `vendor/README.md` for why, and for what replaces this the
 * day the package is published.
 *
 * That makes editing the game a two-repo loop, and this script is the whole loop in one command:
 *
 *   1. `pnpm pack` in the game repo (its `prepack` runs the `tsc` build, so `dist/` is always current),
 *      writing the tarball straight into `vendor/`.
 *   2. Delete any older `@game-hub/game-labyrinth` tarball, so `vendor/` holds exactly one.
 *   3. Rewrite the `file:../vendor/…` specifier in `backend/package.json` and `ui/package.json` if the
 *      filename changed (it changes whenever the game bumps its version). ⚠️ The `../` is not a typo:
 *      pnpm resolves a `file:` specifier relative to the **package that declares it**, so a host-level
 *      manifest has to climb out of `backend/` or `ui/` to reach the repo-root `vendor/`.
 *   4. `pnpm install` at the hub root, so both hosts pick the new tarball up and the lockfile's integrity
 *      hash is updated. ⚠️ That lockfile change **must be committed** — `pnpm install --frozen-lockfile`
 *      inside the Dockerfile will reject a stale one, which is exactly the guard you want.
 *
 * The game repo's location is configurable: set `LABYRINTH_REPO` to an absolute or hub-relative path
 * (default `../game-labyrinth`).
 *
 * Pass `--no-install` to stop after step 3 (useful when you are about to run `pnpm install` yourself).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The npm name of the vendored package, and the tarball prefix `pnpm pack` derives from it. */
const PACKAGE_NAME = '@game-hub/game-labyrinth';
const TARBALL_PREFIX = 'game-hub-game-labyrinth-';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = join(ROOT, 'vendor');
/** The two hosts that depend on the game — the backend takes `./module`, the UI takes `./client`. */
const HOSTS = ['backend', 'ui'];

const repoOption = process.env['LABYRINTH_REPO'] ?? '../game-labyrinth';
const gameRepo = isAbsolute(repoOption) ? repoOption : resolve(ROOT, repoOption);

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const step = (message) => console.log(`\n▶ ${message}`);

if (!existsSync(join(gameRepo, 'package.json'))) {
  console.error(
    `Cannot find the Labyrinth game repo at ${gameRepo}.\n` +
      'Clone https://github.com/whtdrgn101/game-labyrinth next to this repo, or set LABYRINTH_REPO.',
  );
  process.exit(1);
}

mkdirSync(VENDOR, { recursive: true });

step(`packing ${PACKAGE_NAME} from ${gameRepo}`);
// `prepack` in the game repo runs `tsc -p tsconfig.build.json`, so this always packs a fresh `dist/`.
run('pnpm', ['pack', '--pack-destination', VENDOR], gameRepo);

const tarballs = readdirSync(VENDOR).filter((name) => name.startsWith(TARBALL_PREFIX) && name.endsWith('.tgz'));
if (tarballs.length === 0) throw new Error('pnpm pack produced no .tgz in vendor/');
// Version strings don't sort lexicographically (0.10.0 < 0.9.0), so identify the fresh tarball by mtime
// — `pnpm pack` wrote it moments ago.
const newest = tarballs
  .map((name) => ({ name, mtime: statSync(join(VENDOR, name)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0].name;

for (const stale of tarballs.filter((name) => name !== newest)) {
  step(`removing the superseded ${stale}`);
  rmSync(join(VENDOR, stale));
}

const specifier = `file:../vendor/${newest}`;
let rewrote = false;
for (const host of HOSTS) {
  const manifestPath = join(ROOT, host, 'package.json');
  const source = readFileSync(manifestPath, 'utf8');
  const next = source.replace(
    new RegExp(`("${escapeRegExp(PACKAGE_NAME)}": ")file:\\.\\./vendor/[^"]*(")`),
    `$1${specifier}$2`,
  );
  if (next === source) {
    if (!source.includes(specifier)) {
      throw new Error(
        `${host}/package.json has no "${PACKAGE_NAME}": "file:../vendor/…" dependency to update — add one first.`,
      );
    }
    continue;
  }
  writeFileSync(manifestPath, next);
  rewrote = true;
  console.log(`  updated ${host}/package.json → ${specifier}`);
}
if (!rewrote) console.log(`  ${specifier} — both hosts already point at it`);

if (process.argv.includes('--no-install')) {
  console.log('\n✅ vendored. Skipping install (--no-install); run `pnpm install` before building.');
} else {
  step('pnpm install (refreshes the lockfile integrity hash — commit it)');
  run('pnpm', ['install'], ROOT);
  console.log(`\n✅ ${newest} vendored and installed. Commit vendor/ + the two package.json files + the lockfile.`);
}

/** Escape a string for use inside a RegExp (the package name contains `/` and `-`, but not `.`). */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
