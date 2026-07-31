import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/tests/**', // test files + shared helpers
        'src/index.ts', // the public barrel (re-exports only)
        'src/bot/index.ts', // the @game-hub/kernel/bot barrel (re-exports only)
        'src/moveRecord.ts', // compile-time only (MoveRecord interface)
        'src/viewer.ts', // compile-time only (Viewer type alias)
        'src/endState.ts', // compile-time only (GameEndState / WinnersEndState unions)
        // The contract files are compile-time only (the GameModule / GameClient contracts + transport DTOs
        // — interfaces). `contracts/platform.ts` is the exception: it carries the chat/presence guards,
        // real runtime code, so it is deliberately NOT excluded and its branches are gated at 100%.
        'src/contracts/client.ts',
        'src/contracts/module.ts',
        'src/contracts/transport.ts',
      ],
      // The kernel keeps the engine's 100% bar: it holds the load-bearing primitives every game leans
      // on (`record`, `makeSeating`, `GameError`), so every branch here deserves a test. The engine's
      // own gate no longer reaches these files now that they live in a separate package, so this gate
      // is what keeps that discipline honest — see CLAUDE.md "How the shared engine is consumed".
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
