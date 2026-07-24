/**
 * Registry codegen (Track D / D0).
 *
 * Turns the single source of truth — the root `games.config.ts` — into the two checked-in registries
 * the hosts import:
 *
 *   • `backend/src/games/index.generated.ts` — imports each game's module (default export) and builds
 *     `createDefaultRegistry()` + `DEFAULT_GAME_ID`, in config order.
 *   • `ui/src/games/registry.generated.ts`   — imports each game's client (default export) and builds
 *     the `CLIENTS` list (with the one documented erasure cast).
 *
 * The generated files are **committed** (diffable, no build-time codegen), so a CI freshness check
 * (`pnpm generate` + `git diff --exit-code`) guarantees they never drift from the config. Output is run
 * through Prettier so it satisfies `format:check` and is byte-stable across runs (idempotent).
 *
 * Run with `pnpm generate`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import gamesConfig from '../games.config.ts';
import type { GameEntry } from '../games.config.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A safe local identifier for a game's default import (ids are simple lowercase, so this is 1:1). */
const localName = (entry: GameEntry, suffix: string): string => `${entry.id.replace(/[^a-zA-Z0-9_$]/g, '_')}${suffix}`;

const header = (regenFrom: string): string =>
  [
    `// DO NOT EDIT — generated from ${regenFrom} by scripts/generate-registries.ts.`,
    '// Run `pnpm generate` to regenerate. The registration invariants (config order, duplicate-id boot',
    '// crash, seat-bound validation) live in the hand-written registry this feeds.',
  ].join('\n');

function backendSource(games: readonly GameEntry[]): string {
  const imports = games.map((g) => `import ${localName(g, 'Module')} from '${g.module}';`).join('\n');
  const registrations = games.map((g) => `.register(${localName(g, 'Module')})`).join('\n');
  const defaultId = games[0]?.id ?? '';
  return `${header('games.config.ts')}
import { GameRegistry } from './registry';
${imports}

/**
 * The games this site hosts, registered in config order. A factory rather than a shared singleton: the
 * backend tests build many apps against their own in-memory databases, and a registry that outlived one
 * of them would be a cross-test leak.
 */
export const createDefaultRegistry = (): GameRegistry =>
  new GameRegistry()
    ${registrations};

/** The id every existing row is backfilled to when C1 adds \`game_type\` (the first hosted game). */
export const DEFAULT_GAME_ID = ${JSON.stringify(defaultId)};
`;
}

function uiSource(games: readonly GameEntry[]): string {
  const imports = games.map((g) => `import ${localName(g, 'Client')} from '${g.client}';`).join('\n');
  const entries = games.map((g) => `  ${localName(g, 'Client')} as unknown as AnyGameClient,`).join('\n');
  return `${header('games.config.ts')}
import type { GameClient } from './types';
${imports}

/**
 * A registered client with its state type erased. Only a game's own board may pair itself with its own
 * state type, and TypeScript can't say "some \`S\`, but consistently" for a value in a list — so there is
 * exactly one cast per game below. What makes it sound: a board is only ever rendered for a payload
 * whose \`gameType\` selected it, so it only ever receives a state its own game produced. See
 * \`registry.ts\` for the fuller note.
 */
export type AnyGameClient = GameClient<unknown>;

/** The games this room can draw, in config order. Cross-checked against the server catalog by the shell. */
export const CLIENTS: readonly AnyGameClient[] = [
${entries}
];
`;
}

async function writeFormatted(relPath: string, source: string): Promise<void> {
  const target = join(ROOT, relPath);
  const options = (await resolveConfig(target)) ?? {};
  const formatted = await format(source, { ...options, parser: 'typescript' });
  const current = (() => {
    try {
      return readFileSync(target, 'utf8');
    } catch {
      return null;
    }
  })();
  if (current === formatted) {
    console.log(`unchanged  ${relPath}`);
    return;
  }
  writeFileSync(target, formatted);
  console.log(`wrote      ${relPath}`);
}

const games = gamesConfig;
await writeFormatted('backend/src/games/index.generated.ts', backendSource(games));
await writeFormatted('ui/src/games/registry.generated.ts', uiSource(games));
