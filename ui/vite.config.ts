import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Consume the engine as source so Vite transpiles it (shared types + logic). One alias per
      // subpath — the engine is a per-game platform now, with no bare `@game-hub/engine` entry.
      '@game-hub/engine/kernel': fileURLToPath(new URL('../engine/src/kernel/index.ts', import.meta.url)),
      '@game-hub/engine/container': fileURLToPath(
        new URL('../engine/src/games/container/index.ts', import.meta.url),
      ),
      '@game-hub/engine/cantstop': fileURLToPath(
        new URL('../engine/src/games/cantstop/index.ts', import.meta.url),
      ),
      '@game-hub/engine/stoneage': fileURLToPath(
        new URL('../engine/src/games/stoneage/index.ts', import.meta.url),
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
