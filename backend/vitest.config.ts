import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The engine is consumed as TypeScript source via workspace symlink;
    // tell Vitest to transform it rather than treat it as an external dep.
    server: {
      deps: {
        inline: [/@game-hub\/(engine|bot|kernel)/],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/tests/**', // test files + shared helpers
        'src/server.ts', // the production bootstrap (listen/SIGTERM); buildApp itself is tested
        'src/games/module.ts', // the GameModule contract — interfaces only, no runtime code
      ],
      // A real floor, not 100%. Unlike the pure engine, the backend has legitimately hard-to-hit
      // branches (transport edge cases, defensive guards), so a 100% bar would buy churn. This gate
      // exists so a *regression* is visible — the layer that owns all I/O, migrations, the WS
      // transport and the redaction plumbing had no coverage gate at all (see REVIEW.md §2.3).
      // Set just below the current measured numbers; ratchet up as coverage improves, never down.
      thresholds: {
        statements: 94,
        branches: 83,
        functions: 92,
        lines: 94,
      },
    },
  },
});
