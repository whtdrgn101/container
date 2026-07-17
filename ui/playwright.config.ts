import { defineConfig, devices } from '@playwright/test';

const UI_PORT = 5173;
const BASE_URL = `http://127.0.0.1:${UI_PORT}`;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Cap parallelism. The default (half the CPUs — 6 on a 12-core machine, ×2 projects) overwhelms
  // the **Vite dev server's WebSocket proxy**, which resets connections under that many concurrent
  // browser contexts ("[vite] ws proxy socket error: read ECONNRESET"). The dropped socket leaves a
  // page without live state and the spec times out — a dev-tooling limit, not a product one: the
  // backend serves every request fine (no 4xx/5xx, no errors logged), and the production container
  // has no Vite at all (it serves ui/dist directly). 4 is green and costs ~3s over the flaky default.
  workers: 4,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
  // Playwright boots both the API and the UI dev server (which proxies /api → API).
  webServer: [
    {
      command: 'pnpm --filter @game-hub/backend start',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !isCI,
      env: { DATABASE_PATH: ':memory:', PORT: '3001', HOST: '127.0.0.1' },
    },
    {
      command: 'pnpm --filter @game-hub/ui dev',
      url: BASE_URL,
      reuseExistingServer: !isCI,
    },
  ],
});
