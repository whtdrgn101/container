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
      // Track D legacy-migration (phase 5): Container moved from `ui/src/games/container/` into its own
      // in-workspace package over TS source, so its client entry is aliased to source (the RR pattern).
      // Only `/client` is needed — the client imports its own engine via a relative path within the
      // package. (Track D phase 6 retired the `@game-hub/engine` package entirely; no `@game-hub/engine/*`
      // aliases remain, and the UI depends only on `@game-hub/kernel` + the game packages.)
      '@game-hub/game-container/client': fileURLToPath(
        new URL('../packages/games/container/src/client/index.ts', import.meta.url),
      ),
      // Track D pilot: Russian Railroads ships as an in-workspace package over TS source, so — exactly
      // like the engine subpaths above — its client entry is aliased to source rather than resolved as a
      // prebundled node_modules dep. Only `/client` is needed here (the client imports its own engine via
      // a relative path within the package). This alias is a Track D finding — see the package ROADMAP.
      '@game-hub/game-russianrailroads/client': fileURLToPath(
        new URL('../packages/games/russianrailroads/src/client/index.ts', import.meta.url),
      ),
      // Track D pilot retrofit (phase 2): Can't Stop moved from `ui/src/games/cantstop/` into its own
      // in-workspace package over TS source, so its client entry is aliased to source (the RR pattern).
      // Only `/client` is needed — the client imports its own engine via a relative path within the
      // package. The old `@game-hub/engine/cantstop` alias is gone (the client uses `../engine` now).
      '@game-hub/game-cantstop/client': fileURLToPath(
        new URL('../packages/games/cantstop/src/client/index.ts', import.meta.url),
      ),
      // Track D legacy-migration (phase 3): Stone Age moved from `ui/src/games/stoneage/` into its own
      // in-workspace package over TS source, so its client entry is aliased to source (the RR pattern).
      // Only `/client` is needed — the client imports its own engine via a relative path within the
      // package. The old `@game-hub/engine/stoneage` alias is gone (the client uses `../engine` now).
      '@game-hub/game-stoneage/client': fileURLToPath(
        new URL('../packages/games/stoneage/src/client/index.ts', import.meta.url),
      ),
      // Track D legacy-migration (phase 4): Saint Petersburg moved from `ui/src/games/stpetersburg/` into
      // its own in-workspace package over TS source, so its client entry is aliased to source (the RR
      // pattern). Only `/client` is needed — the client imports its own engine via a relative path within
      // the package. The old `@game-hub/engine/stpetersburg` alias is gone (the client uses `../engine`).
      '@game-hub/game-stpetersburg/client': fileURLToPath(
        new URL('../packages/games/stpetersburg/src/client/index.ts', import.meta.url),
      ),
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
