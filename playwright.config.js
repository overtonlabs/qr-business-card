/**
 * Playwright configuration for the end-to-end suite.
 *
 * Purpose
 *   Serves public/ with the repository's own dependency-free static server and drives it in Chromium.
 *   The site has no build step, so what the tests load is exactly what GitHub Pages will publish.
 *
 * Related files
 *   - test/e2e/ - the specs.
 *   - test/support/static-server.mjs - the server started below.
 */

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],

  // Started and stopped by Playwright; nothing is left running after the suite finishes
  webServer: {
    command: `node test/support/static-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore'
  }
});
