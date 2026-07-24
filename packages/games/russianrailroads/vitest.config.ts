import { defineConfig } from 'vitest/config';

/**
 * Russian Railroads is the Track D pilot: an in-workspace game **package** with its own test gate,
 * mirroring the `@game-hub/kernel` precedent (a per-package `vitest` with the engine's 100% bar). The
 * platform-wide engine gate in `engine/vitest.config.ts` no longer reaches this game — it lives outside
 * that package — so this config is what keeps the discipline honest for RR's engine.
 *
 * Only the **engine** subpath is gated here (the pure rules core). The module and client are thin host
 * bindings tested by the backend/UI suites (the same division every other game uses); the bot is a
 * stub until RR10.
 */
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**/*.ts'],
      exclude: [
        'src/engine/**/tests/**', // test files + shared helpers
        'src/engine/**/index.ts', // public + folder barrels (re-exports only)
        'src/engine/core/types.ts', // compile-time only (domain interfaces)
        'src/engine/actions/action.ts', // compile-time only (the Action union)
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
