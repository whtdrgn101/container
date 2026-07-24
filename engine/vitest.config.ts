import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/tests/**', // test files + shared helpers (per-game tests/ folders)
        'src/**/index.ts', // public + folder barrels (the kernel shim, each game, core/internal/actions)
        // The kernel primitives (record/makeSeating/GameError + the type-only files) now live in the
        // `@game-hub/kernel` package with its own 100% gate — nothing under `src/kernel/` to exclude
        // here any more but the re-export shim `index.ts` (already covered by the barrel rule above).
        'src/games/*/core/types.ts', // compile-time only (each game's domain interfaces)
        'src/games/*/actions/action.ts', // compile-time only (each game's Action union)
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
