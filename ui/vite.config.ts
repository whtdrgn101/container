import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Consume the kernel as source so Vite transpiles it (shared primitives + contracts). The
      // `/client` subpath (the React-dependent GameClient/BoardProps contract) must come before the
      // bare entry so the more specific alias wins.
      '@game-hub/kernel/client': fileURLToPath(new URL('../packages/kernel/src/contracts/client.ts', import.meta.url)),
      '@game-hub/kernel': fileURLToPath(new URL('../packages/kernel/src/index.ts', import.meta.url)),
      // Consume the engine as source so Vite transpiles it (shared types + logic). One alias per
      // subpath — the engine is a per-game platform now, with no bare `@game-hub/engine` entry.
      '@game-hub/engine/kernel': fileURLToPath(new URL('../engine/src/kernel/index.ts', import.meta.url)),
      '@game-hub/engine/container': fileURLToPath(new URL('../engine/src/games/container/index.ts', import.meta.url)),
      '@game-hub/engine/cantstop': fileURLToPath(new URL('../engine/src/games/cantstop/index.ts', import.meta.url)),
      '@game-hub/engine/stoneage': fileURLToPath(new URL('../engine/src/games/stoneage/index.ts', import.meta.url)),
      '@game-hub/engine/stpetersburg': fileURLToPath(
        new URL('../engine/src/games/stpetersburg/index.ts', import.meta.url),
      ),
      // Track D pilot: Russian Railroads ships as an in-workspace package over TS source, so — exactly
      // like the engine subpaths above — its client entry is aliased to source rather than resolved as a
      // prebundled node_modules dep. Only `/client` is needed here (the client imports its own engine via
      // a relative path within the package). This alias is a Track D finding — see the package ROADMAP.
      '@game-hub/game-russianrailroads/client': fileURLToPath(
        new URL('../packages/games/russianrailroads/src/client/index.ts', import.meta.url),
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
