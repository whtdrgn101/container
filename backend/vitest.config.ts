import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // The kernel is consumed as TypeScript source via workspace symlink; Vitest must transform it rather
    // than treat it as an external dep. The six games now install as compiled dist (`@game-hub/game-*@
    // ^0.1.0` from npm), but they must be inlined too — and not for their own sake. Each game's dist
    // imports `@game-hub/kernel`, which resolves through the workspace symlink to the kernel's TS *source*
    // (its dev `exports` point at `./src`, with `.js`-extension relative specifiers). A game loaded as a
    // native-external module would drag that source in through Node, which does no `.js`→`.ts` mapping and
    // throws `Cannot find module .../contract.js`. Inlining the game packages puts their whole `@game-hub/*`
    // subtree through Vite's transform, where the mapping happens — the same reason the pre-publish
    // vendored Labyrinth tarball was inlined (design doc §6b: "the existing regex matches it harmlessly").
    server: {
      deps: {
        inline: [/@game-hub\/(kernel|game-)/],
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
