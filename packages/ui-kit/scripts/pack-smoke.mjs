#!/usr/bin/env node
/**
 * Pack smoke test for `@game-hub/ui-kit` (Track D / D2b).
 *
 * Same job as the kernel's (`packages/kernel/scripts/pack-smoke.mjs`), against a package with the
 * opposite shape: this one has real runtime code, real dependencies and JSX. Every check in this repo
 * runs it as workspace-linked **TypeScript source** through a Vite alias, which says nothing about the
 * tarball an out-of-repo game (Labyrinth, D2c) installs. The failure modes it exists to catch:
 *
 *   1. **Extensionless relative imports.** `tsc` emits `from './utils'` verbatim; Node ESM does no
 *      extension resolution, so the installed package throws `ERR_MODULE_NOT_FOUND` on first import even
 *      though every workspace check was green. The kernel shipped exactly that bug pre-D2a — see the
 *      `.js`-extension note in `src/index.ts`.
 *   2. **A missing runtime dependency.** The chrome really does use `clsx`, `tailwind-merge`,
 *      `class-variance-authority` and `lucide-react` at runtime. In the workspace they resolve out of the
 *      repo root whether or not this package declares them; installed, an undeclared one is a hard crash.
 *   3. **React leaking out of `peerDependencies`.** Two React copies is a broken app; two *ui-kit* copies
 *      is a silently missing rematch button (`RematchContext` identity). React must be a peer, never a
 *      dependency.
 *
 * Deliberately **not** duplicated from the kernel's script: the two share the shape (pack → install
 * outside the workspace → run node → run tsc) but almost none of the content, and one abstraction over
 * two examples is what the extract-on-the-third-example rule (design-patterns §8) says not to build. If
 * a third package needs a pack smoke, extract the harness then.
 *
 * Run: `pnpm --filter @game-hub/ui-kit pack:smoke`   (CI runs it beside the kernel's.)
 * Set `KEEP_SMOKE_DIR=1` to leave the temp project behind for inspection.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What plain Node must be able to do with the installed package: import the entry through the `exports`
 * map and get *working* code — the components as functions, the seat rule and the transport actually
 * computing the right answers.
 */
const RUNTIME_SMOKE = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ActionTip,
  ActivityFeed,
  Button,
  Card,
  GameOver,
  PanZoom,
  RematchContext,
  TurnBanner,
  apiUrl,
  cn,
  configureTransport,
  seatIdentity,
} from '@game-hub/ui-kit';

const require = createRequire(import.meta.url);

// The chrome: components resolve as real functions (not undefined re-exports through a broken barrel).
for (const [name, value] of Object.entries({ ActionTip, ActivityFeed, Button, Card, GameOver, PanZoom, TurnBanner })) {
  assert.equal(typeof value, 'function', name + ' must be a component');
}
assert.ok(RematchContext && typeof RematchContext === 'object', 'RematchContext must be a React context');

// cn really merges conflicting Tailwind classes (i.e. tailwind-merge is installed and wired, not just
// imported) — the utility every board leans on.
assert.equal(cn('p-2', 'p-4'), 'p-4');
assert.equal(cn('text-sm', false && 'hidden', 'font-medium'), 'text-sm font-medium');

// The seat-binding rule — the platform rule every board gates its affordances on.
assert.deepEqual(
  seatIdentity({
    players: [{ id: 'p1', name: 'Ann' }, { id: 'p2', name: 'Bo' }],
    activePlayerId: 'p1',
    bots: [],
    controlledIds: ['p1'],
  }),
  { canDrive: true, myNames: ['Ann'] },
);
assert.equal(
  seatIdentity({ players: [], activePlayerId: 'p1', bots: ['p1'], controlledIds: null }).canDrive,
  false,
  'a bot seat is never drivable',
);

// The transport's injected base URL: a published package must not bake in the host's dev-proxy prefix.
assert.equal(apiUrl('/games/x'), '/games/x', 'the default base is the page origin');
configureTransport({ baseUrl: '/api' });
assert.equal(apiUrl('/games/x'), '/api/games/x');

// React is the **peer the consumer supplies** — it is deliberately not in the tarball's dependencies, and
// the copy placed in this project is the one the components resolved. Two React copies is a broken app;
// two ui-kit copies is a silently missing rematch button (RematchContext identity), which is why neither
// react nor the kernel may drift into 'dependencies'.
const manifest = require('@game-hub/ui-kit/package.json');
assert.deepEqual(Object.keys(manifest.dependencies ?? {}).sort(), [
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'tailwind-merge',
]);
assert.deepEqual(Object.keys(manifest.peerDependencies ?? {}).sort(), ['@game-hub/kernel', 'react']);

console.log('runtime smoke ok — the entry resolves and the chrome, seat rule and transport all behave');
`;

/**
 * What a consumer's compiler must see. This is deliberately shaped like a **game package's board**: it
 * binds the kernel's transport DTOs the way `client/types.ts` does and renders the chrome with the props
 * the five games pass, so the check fails if either surface drifts.
 */
const TYPE_CONSUMER = `import { lazy } from 'react';
import type { BoardProps, GameClient, GameMessage, GamePayload } from '@game-hub/kernel/client';
import {
  ActivityFeed,
  Button,
  GameOver,
  TurnBanner,
  applyAction,
  cn,
  getGame,
  seatIdentity,
} from '@game-hub/ui-kit';
import type { LogEntry } from '@game-hub/ui-kit';

type View = {
  readonly id: string;
  readonly version: number;
  readonly players: readonly { readonly id: string; readonly name: string }[];
  readonly activePlayerId: string | null;
  readonly log: readonly LogEntry[];
};

// Exactly the two aliases every game package's client/types.ts declares.
type SmokeBoardProps = BoardProps<View, GamePayload<View>, GameMessage>;
type SmokeClient = GameClient<View, GamePayload<View>, GameMessage>;

function Board({ game, bots, controlledIds, viewer, guard, onPayload, onLeave }: SmokeBoardProps) {
  const { canDrive, myNames } = seatIdentity({
    players: game.players,
    activePlayerId: game.activePlayerId,
    bots,
    controlledIds,
  });
  const act = () => guard(async () => onPayload(await applyAction<View>(game.id, 'p1', { type: 'NOOP' }, viewer)));
  return (
    <div className={cn('space-y-4', canDrive && 'font-medium')}>
      <TurnBanner testId="smoke-banner" canDrive={canDrive}>
        <span>{myNames?.join(' & ') ?? 'Hotseat'}</span>
      </TurnBanner>
      <Button size="sm" variant="outline" disabled={!canDrive} onClick={act}>
        Act
      </Button>
      <ActivityFeed log={game.log} players={game.players} botIds={bots} describe={(entry) => entry.type} />
      {game.activePlayerId === null ? <GameOver winnerNames={['Ann']} onNewGame={onLeave} /> : null}
    </div>
  );
}

export const client: SmokeClient = {
  id: 'smoke',
  name: 'Smoke',
  blurb: 'A board-shaped consumer of the ui-kit.',
  Board: lazy(async () => ({ default: Board })),
};

export const refetch = (id: string) => getGame<View>(id);
`;

const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    jsx: 'react-jsx',
    // The strictest resolution mode on purpose: `nodenext` honours the `exports` map exactly as Node
    // does and rejects extensionless relative specifiers inside the shipped `.d.ts` files. If this
    // passes, a consumer on `bundler` resolution (every real host) is safe by construction.
    module: 'nodenext',
    moduleResolution: 'nodenext',
    strict: true,
    noEmit: true,
    // The shipped declarations are exactly what we're checking, so don't skip them. (DefinitelyTyped's
    // own health isn't this script's business, but it can't be skipped selectively — `@types/react` is
    // clean under this setting today; if that ever changes, pin it rather than turning this off.)
    skipLibCheck: false,
    types: [],
  },
  include: ['consumer.tsx'],
};

const kitDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(kitDir, 'package.json'));

/** Run a command, streaming its output; a non-zero exit throws and fails the script. */
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const step = (message) => console.log(`\n▶ ${message}`);

// A temp dir under the OS temp root, deliberately **outside** the pnpm workspace: inside it, pnpm/npm
// would resolve `@game-hub/ui-kit` back to the linked source and prove nothing.
const projectDir = mkdtempSync(join(tmpdir(), 'game-hub-ui-kit-pack-smoke-'));
let ok = false;
try {
  // Both packages, as tarballs: the ui-kit's declarations reference `@game-hub/kernel/client`, so the
  // consumer must typecheck against the kernel's **published** artefact too, not its workspace source.
  // (`prepack` runs each package's tsc build, so this also proves both builds are wired to the publish
  // path.)
  step(`packing @game-hub/kernel + @game-hub/ui-kit → ${projectDir}`);
  run('pnpm', ['pack', '--pack-destination', projectDir], join(kitDir, '..', 'kernel'));
  run('pnpm', ['pack', '--pack-destination', projectDir], kitDir);
  const tarballs = readdirSync(projectDir).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 2) throw new Error(`expected 2 tarballs, got ${tarballs.length}`);

  step(`installing ${tarballs.join(' + ')} into a throwaway project`);
  writeFileSync(
    join(projectDir, 'package.json'),
    `${JSON.stringify({ name: 'ui-kit-pack-smoke', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
  );
  // npm rather than pnpm: no workspace inference. `--legacy-peer-deps` turns off npm's peer *resolution*
  // entirely — `@game-hub/kernel` isn't on the registry yet, and React must stay absent so the peer
  // boundary is genuinely tested. `--ignore-scripts` because nothing in the tarballs should need to run.
  run(
    'npm',
    [
      'install',
      ...tarballs.map((name) => `./${name}`),
      '--no-audit',
      '--no-fund',
      '--no-package-lock',
      '--ignore-scripts',
      '--legacy-peer-deps',
    ],
    projectDir,
  );

  // The two peers a real consumer brings: React (the emitted JSX imports `react/jsx-runtime` **statically**,
  // so even importing the barrel needs it) and `@types/react` (the shipped `.d.ts` name React's prop
  // types). `--legacy-peer-deps` above deliberately installed neither, so place them by hand — copied out
  // of the workspace store rather than fetched, so this stays runnable offline. `csstype` is
  // `@types/react`'s one dependency and pnpm's strict store only exposes it *from* there, so resolve it
  // through a require rooted in that package.
  const typesReactDir = dirname(require.resolve('@types/react/package.json'));
  const fromTypesReact = createRequire(join(typesReactDir, 'package.json'));
  for (const [pkg, sourceDir] of [
    ['react', dirname(require.resolve('react/package.json'))],
    ['@types/react', typesReactDir],
    ['csstype', dirname(fromTypesReact.resolve('csstype/package.json'))],
  ]) {
    cpSync(sourceDir, join(projectDir, 'node_modules', pkg), { recursive: true });
  }

  step('runtime: importing the entry with plain node');
  writeFileSync(join(projectDir, 'smoke.mjs'), RUNTIME_SMOKE);
  run(process.execPath, ['smoke.mjs'], projectDir);

  step('types: tsc --noEmit against the installed package (nodenext resolution)');
  writeFileSync(join(projectDir, 'consumer.tsx'), TYPE_CONSUMER);
  writeFileSync(join(projectDir, 'tsconfig.json'), `${JSON.stringify(CONSUMER_TSCONFIG, null, 2)}\n`);
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.json'], projectDir);

  ok = true;
  console.log('\n✅ pack smoke passed — the published tarball imports and typechecks outside the workspace.');
} finally {
  if (process.env['KEEP_SMOKE_DIR'] === '1') {
    console.log(`\n(kept ${projectDir}${ok ? '' : ' — the failure is reproducible there'})`);
  } else {
    rmSync(projectDir, { recursive: true, force: true });
  }
}
