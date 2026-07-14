import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      // index.ts is a re-export barrel; types.ts and actions.ts are compile-time only.
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/types.ts', 'src/actions.ts'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
