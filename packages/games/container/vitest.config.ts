import { defineConfig } from 'vitest/config';

/**
 * Container is the Track D legacy-migration **phase 5** retrofit — the heaviest game moved out of the
 * shared `engine/` + `bot/` packages into its own in-workspace game package, following the RR precedent
 * and the Can't Stop / Stone Age / Saint Petersburg phases. This config carries **both** coverage gates
 * the game used to answer to — the platform-wide engine 100% gate (`engine/vitest.config.ts`) and the bot
 * 90% gate (`bot/vitest.config.ts`) no longer reach this game (it lives outside those packages), so this
 * file is what keeps that discipline honest.
 *
 * The two gates are enforced with **per-glob thresholds**: `src/engine/**` at 100% (rules — every branch
 * is a rule and deserves a test) and `src/bot/**` at 90% (opinions — heuristic weights get retuned, so a
 * 100% bar on judgement calls buys churn, not correctness; what must stay covered is that every decision
 * is legal and every policy is reachable). The module and client are host bindings tested by the
 * backend/UI suites, the same division every game uses. The bot's self-play + bench tests move with the
 * bot and run here (3–5 player self-play, seeded rng).
 *
 * `@game-hub/kernel` ships TypeScript source (the engine imports it and the bot imports its `./bot`
 * subpath), so Vitest must transform it across the workspace boundary.
 */
export default defineConfig({
  test: {
    include: ['src/engine/**/*.test.ts', 'src/bot/**/*.test.ts'],
    // The bot's bench/self-play tests run whole seeded games (CPU-bound), and since the game-package
    // split `pnpm -r test` runs several packages' vitest processes CONCURRENTLY — on a 4-core CI runner
    // the default 5s timeout starves them (observed: 14s under contention, fine alone). Headroom, not a
    // hang-mask: a genuinely wedged test still dies here.
    testTimeout: 30_000,
    server: { deps: { inline: [/@game-hub\/kernel/] } },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/engine/**/*.ts', 'src/bot/**/*.ts'],
      exclude: [
        // Engine excludes (ported verbatim from engine/vitest.config.ts).
        'src/engine/**/tests/**', // test files + shared helpers
        'src/engine/**/index.ts', // public + folder barrels (re-exports only)
        'src/engine/core/types.ts', // compile-time only (domain interfaces)
        'src/engine/actions/action.ts', // compile-time only (the Action union)
        // Bot excludes (ported from bot/vitest.config.ts; the aggregator src/bench.ts stays in bot/).
        'src/bot/**/tests/**', // test files + shared helpers
        'src/bot/**/index.ts', // public + policies barrels (re-exports only)
        'src/bot/types.ts', // compile-time only (options/context interfaces)
      ],
      thresholds: {
        // The pure rules core — every rule and every rejection path tested.
        'src/engine/**': {
          statements: 100,
          branches: 100,
          functions: 100,
          lines: 100,
        },
        // The AI opinions — legal + reachable, not exhaustive (the bot package's standing 90% bar).
        'src/bot/**': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90,
        },
      },
    },
  },
});
