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
        'src/**/index.ts', // public + folder barrels (kernel, each game, core/internal/actions)
        'src/kernel/moveRecord.ts', // compile-time only (MoveRecord interface)
        'src/kernel/viewer.ts', // compile-time only (Viewer type alias)
        'src/kernel/endState.ts', // compile-time only (GameEndState / WinnersEndState unions)
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
