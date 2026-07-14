import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/tests/**', // test files + shared helpers
        'src/index.ts', // public barrel
        'src/**/index.ts', // folder barrels (core, internal, actions)
        'src/core/types.ts', // compile-time only (interfaces/type aliases)
        'src/actions/action.ts', // compile-time only (Action union)
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
