import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // `@game-hub/engine` ships TypeScript source, so Vitest must transform it across the
    // workspace boundary (same arrangement as the backend).
    server: { deps: { inline: [/@game-hub\/engine/] } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/tests/**', // test files + shared helpers (per-game tests/ folders)
        'src/**/index.ts', // public + folder barrels (kernel, each game, policies)
        'src/games/*/types.ts', // compile-time only (each game's options/context interfaces)
      ],
      // Deliberately 90%, not the engine's 100%. The engine encodes rules — every branch is a rule
      // and deserves a test. The bot encodes *opinions*: heuristic weights get retuned constantly
      // (Track A3/A5), and a 100% bar on judgement calls buys test churn rather than correctness.
      // What must stay covered is that every decision is legal and every policy is reachable.
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
