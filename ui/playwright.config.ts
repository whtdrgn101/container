import { defineConfig, devices } from '@playwright/test';

const UI_PORT = 5173;
const BASE_URL = `http://127.0.0.1:${UI_PORT}`;
const isCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
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
      command: 'pnpm --filter @container/backend start',
      url: 'http://127.0.0.1:3001/health',
      reuseExistingServer: !isCI,
      env: { DATABASE_PATH: ':memory:', PORT: '3001', HOST: '127.0.0.1' },
    },
    {
      command: 'pnpm --filter @container/ui dev',
      url: BASE_URL,
      reuseExistingServer: !isCI,
    },
  ],
});
