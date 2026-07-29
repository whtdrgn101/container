// ESLint 9 flat config for the Game Hub monorepo.
//
// Scope on purpose: this is a *pre-commit-speed* lint, not a second typechecker (`pnpm typecheck`
// already owns type correctness across every package). So we run typescript-eslint's **recommended**
// (syntactic) rules only — no `recommendedTypeChecked`, which would spin up the TS program per lint and
// turn a fast hazard-check into a slow duplicate of tsc. Style is Prettier's job (eslint-config-prettier
// last disables anything stylistic). What we keep are the real hazards: React hooks deps, obvious bugs.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // Not source — never lint build outputs, deps, coverage, Playwright artifacts, generated files.
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      'ui/test-results/**',
      'ui/playwright-report/**',
      'ui/e2e/**-snapshots/**',
      '.claude/**',
    ],
  },

  // Baseline for every TS/TSX file across the workspace.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      // engine/backend/bot + the *.config.ts files run under Node.
      globals: { ...globals.node },
    },
    rules: {
      // Align with the existing code style: a leading `_` marks an intentionally-unused binding
      // (args, destructured rest, caught errors). Everything else unused is a real error.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // Node scripts (e.g. the Docker build's bundle smoke-proof) run under Node with its globals.
  {
    files: ['**/scripts/**/*.{mjs,js}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // React + hooks — every place that renders JSX. Track D moved that beyond `ui/`: each game package's
  // `./client` and (D2b) the shared chrome in `packages/ui-kit` render too, and the hooks rules must
  // follow the code rather than the directory it used to live in.
  {
    ...react.configs.flat.recommended,
    files: ['ui/**/*.{ts,tsx}', 'packages/ui-kit/**/*.{ts,tsx}', 'packages/games/*/src/client/**/*.{ts,tsx}'],
    settings: { react: { version: 'detect' } },
  },
  {
    // The UI uses the automatic JSX runtime (tsconfig `jsx: react-jsx`), so React need not be in scope.
    ...react.configs.flat['jsx-runtime'],
    files: ['ui/**/*.{ts,tsx}', 'packages/ui-kit/**/*.{ts,tsx}', 'packages/games/*/src/client/**/*.{ts,tsx}'],
  },
  {
    files: ['ui/src/**/*.{ts,tsx}', 'packages/ui-kit/src/**/*.{ts,tsx}', 'packages/games/*/src/client/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The whole reason this lint exists (REVIEW Tier 5): protect the ref-vs-dep arrangement in
      // useGameTransport. Both are errors — a stale dep array is a real bug, not a style nit.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },

  // Prettier owns formatting — turn off every stylistic rule so the two never fight. Must stay last.
  prettier,
);
