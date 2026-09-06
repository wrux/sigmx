import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/browser',
  testMatch: /.*\.spec\.mjs/,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:8765', headless: true },
  webServer: {
    command: 'node scripts/dev.mjs',
    url: 'http://127.0.0.1:8765/tests/browser/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
