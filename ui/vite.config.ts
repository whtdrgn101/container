import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    /**
     * ⚠️ Track D / D2d — **required** once a game arrives as an installed package rather than as
     * workspace source (Labyrinth). Measured, not guessed; here is the failure it fixes.
     *
     * In **dev**, Vite pre-bundles anything under `node_modules` with esbuild. `@game-hub/game-labyrinth`
     * is exactly that, and its board imports `@game-hub/ui-kit`. The optimizer followed the alias below,
     * pulled the ui-kit **into the game's pre-bundle**, and the app then ran *two* copies of it: the
     * shell's (aliased to source) and the game's. Module-level state is per copy, so the shell's
     * `configureTransport({ baseUrl: '/api' })` never reached the board's — every action it sent went to
     * `/games/:id/actions` instead of `/api/games/:id/actions` and 404'd. React context identity
     * (`RematchContext`) has the same failure mode, silently.
     *
     * Excluding the two shared packages leaves them as runtime imports inside the pre-bundle, which Vite
     * then resolves through the aliases below — one copy, shared by shell and game. It is stated as a
     * rule about the *shared singletons* rather than about Labyrinth, so every future installed game is
     * covered without touching this file.
     *
     * Only the dev server is affected: `vite build` resolves through the same aliases with Rollup and
     * already emitted a single transport (verified in `ui/dist/assets/`), which is why the Docker image
     * was never wrong — and why this would have shipped as a dev-only mystery without the e2e suite.
     */
    exclude: ['@game-hub/kernel', '@game-hub/ui-kit'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Consume the kernel as source so Vite transpiles it (shared primitives + contracts). The
      // `/client` subpath (the React-dependent GameClient/BoardProps contract) must come before the
      // bare entry so the more specific alias wins.
      '@game-hub/kernel/client': fileURLToPath(new URL('../packages/kernel/src/contracts/client.ts', import.meta.url)),
      '@game-hub/kernel': fileURLToPath(new URL('../packages/kernel/src/index.ts', import.meta.url)),
      // Track D / D2b: the shared board chrome (+ the game-facing REST helpers) moved out of `ui/src`
      // into its own publishable package. Consumed as source in-workspace, exactly like the kernel — and
      // aliased for the same reason: one copy for the shell *and* every game package, so React context
      // identity (`RematchContext`) holds across the seam.
      '@game-hub/ui-kit': fileURLToPath(new URL('../packages/ui-kit/src/index.ts', import.meta.url)),
      // No per-game `/client` aliases: since 2026-07-31 all six games install from npm as compiled
      // `dist/` and resolve out of `node_modules` like any dependency — exactly as Labyrinth already did
      // (it never had an alias, which is what proved these were unneeded). The kernel + ui-kit aliases
      // above stay because both hosts still consume those two as TS source in-workspace, and
      // `optimizeDeps.exclude` (above) keeps a single copy of each reaching the installed games.
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Forward API calls to the backend; keeps the browser same-origin (no CORS).
      // `ws: true` also proxies the WebSocket upgrade for the live game stream.
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
