#!/usr/bin/env node
/**
 * Pack smoke test for `@game-hub/kernel` (Track D / D2a).
 *
 * The honest "works outside the workspace" evidence. Every other check in this repo runs against the
 * kernel's **TypeScript source** through the workspace link — which proves nothing about the artefact an
 * out-of-repo game (Labyrinth, D2c) will actually install. That artefact is a tarball whose `exports`
 * resolve to `dist/`, and its two failure modes are invisible in-workspace:
 *
 *   1. **Extensionless relative imports.** `tsc` emits `from './errors'` verbatim; Node ESM does no
 *      extension resolution, so the installed package throws `ERR_MODULE_NOT_FOUND` on first import even
 *      though every workspace suite was green. This is exactly what the pre-D2a build produced — see the
 *      `.js`-extension note in `src/index.ts`.
 *   2. **A leaked runtime dependency.** `./client` imports React *types*; if that ever stops being a
 *      type-only import, the published package silently requires React at runtime for consumers who only
 *      wanted the module contract.
 *
 * So: pack it, install the tarball into a throwaway project **outside** the workspace, and drive it two
 * ways — plain `node` for the runtime surface, and `tsc --noEmit` under `nodenext` resolution (the
 * strictest mode: it honours the `exports` map exactly as Node does and refuses extensionless relative
 * specifiers inside the shipped `.d.ts`) for the type surface.
 *
 * Run: `pnpm --filter @game-hub/kernel pack:smoke`   (CI runs it after the unit tests.)
 * Set `KEEP_SMOKE_DIR=1` to leave the temp project behind for inspection.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What plain Node must be able to do with the installed package: reach every subpath through the
 * `exports` map and get *working* primitives, not merely importable ones.
 */
const RUNTIME_SMOKE = `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { GameError, KERNEL_CONTRACT_VERSION, makeSeating, mulberry32, record, runBotLoop, shuffle } from '@game-hub/kernel';
import { BotError, mulberry32 as botMulberry32, wilsonInterval } from '@game-hub/kernel/bot';
import * as clientContract from '@game-hub/kernel/client';
import { isChatPush, isPresencePush } from '@game-hub/kernel/client';

const require = createRequire(import.meta.url);

// '.' — the framework-free barrel.
assert.equal(typeof runBotLoop, 'function');
assert.equal(KERNEL_CONTRACT_VERSION, 1);

const error = new GameError('OUT_OF_SUPPLY', 'no containers left');
assert.ok(error instanceof Error);
assert.equal(error.code, 'OUT_OF_SUPPLY');
assert.equal(error.name, 'GameError');

const next = record({ version: 3, log: [], seats: 2 }, 'PRODUCE', 'p1', { seats: 3 }, { colour: 'red' });
assert.deepEqual(next, {
  version: 4,
  seats: 3,
  log: [{ seq: 4, type: 'PRODUCE', playerId: 'p1', payload: { colour: 'red' } }],
});

const seating = makeSeating(() => {
  throw new GameError('PLAYER_NOT_FOUND', 'no such seat');
});
const state = { players: [{ id: 'p1' }, { id: 'p2' }], activePlayerIndex: 1 };
assert.equal(seating.seatOf(state, 'p2'), 1);
assert.equal(seating.activePlayer(state).id, 'p2');
assert.deepEqual(seating.withPlayer(state, 0, { id: 'p9' }), [{ id: 'p9' }, { id: 'p2' }]);
assert.throws(() => seating.seatOf(state, 'nobody'), /no such seat/);

// Seeded setup randomness on the '.' barrel (kernel 1.2.0) — what an out-of-repo *engine* test needs.
assert.deepEqual(shuffle([1, 2, 3]), [1, 2, 3], 'no rng ⇒ the given order');
assert.deepEqual(shuffle([1, 2, 3, 4, 5], mulberry32(3)), shuffle([1, 2, 3, 4, 5], mulberry32(3)));
assert.deepEqual([...shuffle([1, 2, 3, 4, 5], mulberry32(3))].sort(), [1, 2, 3, 4, 5]);

// './bot' — the bot primitives. mulberry32 is re-exported here (the benches import it from this
// subpath), and must be the very same function the '.' barrel exports, not a second copy.
// (No backticks in these comments: they live inside a template literal.)
assert.ok(new BotError('nope') instanceof Error);
assert.equal(botMulberry32, mulberry32);
assert.equal(typeof mulberry32(1)(), 'number');
assert.equal(wilsonInterval(0, 0).length, 2);

// './client' — mostly types, but since kernel 1.3.0 it also carries the two platform-envelope guards
// (chat/presence), the one bit of runtime code on this subpath. They must resolve, behave, and — the
// load-bearing part — pull in no React: the kernel must never make React a runtime dependency.
assert.deepEqual(Object.keys(clientContract).sort(), ['isChatPush', 'isPresencePush']);
assert.equal(isChatPush({ type: 'chat', messages: [] }), true);
assert.equal(isChatPush({ type: 'state', game: {} }), false);
assert.equal(isPresencePush({ type: 'presence', viewers: [] }), true);
assert.equal(isPresencePush({ type: 'chat', messages: [] }), false);
assert.throws(() => require.resolve('react'), /Cannot find module/);
assert.deepEqual(
  require('@game-hub/kernel/package.json').dependencies ?? {},
  {},
  'the kernel must ship with no runtime dependencies',
);

console.log('runtime smoke ok — . / ./bot / ./client all resolve and behave');
`;

/** What a consumer's compiler must see: the whole exported type surface, through the published `exports`. */
const TYPE_CONSUMER = `import { GameError, KERNEL_CONTRACT_VERSION, makeSeating, record, shuffle } from '@game-hub/kernel';
import type { GameModule, GameSummary, ModuleContext, MoveRecord, Viewer } from '@game-hub/kernel';
import { BotError, mulberry32 } from '@game-hub/kernel/bot';
import { isChatPush, isPresencePush } from '@game-hub/kernel/client';
import type {
  BoardProps,
  ChatMessage,
  ChatPush,
  GameClient,
  GameMessage,
  GamePayload,
  PresencePush,
  PresenceViewer,
} from '@game-hub/kernel/client';

// A game-shaped declaration: the exact surface an out-of-repo package implements.
type State = { readonly version: number; readonly log: readonly MoveRecord[]; readonly seat: number };

const smokeModule: GameModule<State, { readonly type: 'NOOP' }> = {
  id: 'smoke',
  kernelContract: KERNEL_CONTRACT_VERSION,
  name: 'Smoke',
  minPlayers: 2,
  maxPlayers: 4,
  colors: ['red', 'blue'],
  // kernel 1.2.0's colour channel: a game whose colour is rules data reads the host's resolved pick
  // off each seat. Checking it here is the out-of-workspace proof that the widened parameter really
  // ships in the tarball's .d.ts — the field an out-of-repo game (Labyrinth) needs.
  createGame: (opts) => ({ version: 0, log: [], seat: opts.players.findIndex((player) => player.color === 'red') }),
  applyAction: (state) => record(state, 'NOOP', 'p1'),
  legalActions: () => [{ type: 'NOOP' }],
  viewFor: (state, viewer: Viewer) => ({ ...state, viewer }),
  parseAction: (raw) => (raw === null ? { ok: false, message: 'null' } : { ok: true, action: { type: 'NOOP' } }),
  summarize: (state): GameSummary => ({
    id: 'smoke',
    turn: state.version,
    status: 'active',
    activePlayerId: null,
    players: [],
  }),
  versionOf: (state) => state.version,
  movesOf: (state) => state.log,
  mapError: (error) => (error instanceof GameError ? { status: 400, code: error.code, message: error.message } : null),
  createBotDriver: (ctx: ModuleContext) => ({ tick: () => void ctx.rng() }),
};

// …and the other half of "additive": a game written against kernel 1.0/1.1, whose setup declares the
// narrow name-only seat, still satisfies the widened member untouched. This is the assignability the
// minor bump rests on — if it ever stops compiling, the change was breaking and the contract must move.
const legacyCreateGame = (opts: {
  readonly id: string;
  readonly players: readonly { readonly name: string }[];
  readonly rng: () => number;
}): State => ({ version: 0, log: [], seat: opts.players.length });
const legacyModule: Pick<GameModule<State, { readonly type: 'NOOP' }>, 'createGame'> = {
  createGame: legacyCreateGame,
};

const seating = makeSeating<{ readonly id: string }>(() => {
  throw new BotError('unreachable');
});

// The D2b transport DTOs, bound exactly as a game package's client/types.ts binds them. This is the
// out-of-workspace proof that they really ship on './client' — before D2b they lived in the hub's
// ui/src, which an installed game cannot reach.
type SmokeClient = GameClient<State, GamePayload<State>, GameMessage>;
type SmokeBoardProps = BoardProps<State, GamePayload<State>, GameMessage>;

const payload: GamePayload<State> = {
  game: { version: 0, log: [], seat: 0 },
  gameType: 'smoke',
  bots: [],
  colors: {},
  players: [{ id: 'p1', name: 'Ann' }],
  activePlayerId: 'p1',
};

// kernel 1.3.0: the typed platform envelopes on './client' — the DTOs, the frame shapes, and the two
// guards that narrow the open GameMessage. Binding them here is the out-of-workspace proof they ship.
const chat: ChatMessage = { seq: 1, senderId: 'p1', sender: 'Ann', body: 'gg', at: '2026-07-31T00:00:00.000Z' };
const chatFrame: ChatPush = { type: 'chat', messages: [chat] };
const presenceFrame: PresencePush = {
  type: 'presence',
  viewers: [{ id: '1', label: 'Ann' } satisfies PresenceViewer],
};
// The frames arrive off the socket as an open GameMessage; the guards narrow one back to its typed shape
// (never the reverse — a closed frame has no index signature, which is the whole point of leaving
// GameMessage open). So the guard input is a GameMessage, exactly as subscribeGame hands it over.
const frame: GameMessage = { type: 'chat', messages: [chat] };

// Referenced so the React-typed './client' subpath is genuinely resolved and checked, not just imported.
export const surface = {
  module: smokeModule.id,
  legacySeat: legacyModule.createGame({ id: 'g', players: [{ name: 'Ann' }], rng: () => 0 }).seat,
  seat: seating.activePlayer({ players: [{ id: 'p1' }], activePlayerIndex: 0 }).id,
  rng: mulberry32(1)(),
  // The '.' barrel's setup helper, generic-checked against a concrete element type.
  deal: shuffle<string>(['a', 'b', 'c'], mulberry32(2))[0] ?? '',
  client: null as SmokeClient | null,
  // kernel 1.3.0's optional GameClient.icon — the lazy "box lid". Indexed off the contract so a change to
  // its type surfaces here, the same out-of-workspace check the DTOs get.
  icon: undefined as SmokeClient['Icon'],
  boardTitle: null as SmokeBoardProps['gameId'] | null,
  // The platform envelopes, narrowed through the shipped guards.
  chatSeq: chat.seq,
  chatType: chatFrame.type,
  presenceCount: presenceFrame.viewers.length,
  narrowedChat: isChatPush(frame) ? frame.messages.length : 0,
  narrowedPresence: isPresencePush(frame) ? frame.viewers.length : 0,
  // The board's onPayload must accept exactly the payload a state route returns — the whole point of
  // moving the DTO into the kernel. (No backticks in this comment: it lives inside a template literal.)
  onPayload: (props: SmokeBoardProps) => props.onPayload(payload),
  sideChannel: (message: GameMessage) => message.type,
};
`;

const CONSUMER_TSCONFIG = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM'],
    // The strictest resolution mode on purpose: `nodenext` honours the `exports` map exactly as Node
    // does and rejects extensionless relative specifiers inside the shipped `.d.ts` files. If this
    // passes, a consumer on `bundler` resolution is safe by construction.
    module: 'nodenext',
    moduleResolution: 'nodenext',
    strict: true,
    noEmit: true,
    // The kernel's own shipped declarations are what we're checking, so don't skip them. (`@types/react`
    // is skipped implicitly — it is only reachable through the kernel's `./client` declaration, and
    // DefinitelyTyped's own health is not this script's business.)
    skipLibCheck: false,
    types: [],
  },
  include: ['consumer.ts'],
};

const kernelDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(kernelDir, 'package.json'));

/** Run a command, streaming its output; a non-zero exit throws and fails the script. */
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const step = (message) => console.log(`\n▶ ${message}`);

// A temp dir under the OS temp root, deliberately **outside** the pnpm workspace: inside it, pnpm/npm
// would resolve `@game-hub/kernel` back to the linked source and prove nothing.
const projectDir = mkdtempSync(join(tmpdir(), 'game-hub-kernel-pack-smoke-'));
let ok = false;
try {
  step(`packing @game-hub/kernel → ${projectDir}`);
  // `prepack` runs the tsc build, so this also proves the build is wired to the publish path.
  run('pnpm', ['pack', '--pack-destination', projectDir], kernelDir);
  const tarball = readdirSync(projectDir).find((name) => name.endsWith('.tgz'));
  if (!tarball) throw new Error('pnpm pack produced no .tgz');

  step(`installing ${tarball} into a throwaway project`);
  writeFileSync(
    join(projectDir, 'package.json'),
    `${JSON.stringify({ name: 'kernel-pack-smoke', version: '0.0.0', private: true, type: 'module' }, null, 2)}\n`,
  );
  // npm rather than pnpm: no workspace inference, and a local tarball with no runtime dependencies
  // installs offline. `--ignore-scripts` because nothing in the tarball should need to run.
  run(
    'npm',
    ['install', `./${tarball}`, '--no-audit', '--no-fund', '--no-package-lock', '--ignore-scripts'],
    projectDir,
  );

  step('runtime: importing all three subpaths with plain node');
  writeFileSync(join(projectDir, 'smoke.mjs'), RUNTIME_SMOKE);
  run(process.execPath, ['smoke.mjs'], projectDir);

  step('types: tsc --noEmit against the installed package (nodenext resolution)');
  // `./client`'s `.d.ts` imports React types, so the type check needs `@types/react` present — the
  // optional peer. Copy it (and its one dependency) out of the workspace store rather than hitting the
  // network, so this stays runnable offline and in CI without a registry round-trip.
  // `csstype` is `@types/react`'s one dependency, and pnpm's strict store only exposes it *from* that
  // package — so resolve it through a require rooted there rather than from the kernel.
  const typesReactDir = dirname(require.resolve('@types/react/package.json'));
  const fromTypesReact = createRequire(join(typesReactDir, 'package.json'));
  for (const [pkg, sourceDir] of [
    ['@types/react', typesReactDir],
    ['csstype', dirname(fromTypesReact.resolve('csstype/package.json'))],
  ]) {
    cpSync(sourceDir, join(projectDir, 'node_modules', pkg), { recursive: true });
  }
  writeFileSync(join(projectDir, 'consumer.ts'), TYPE_CONSUMER);
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
