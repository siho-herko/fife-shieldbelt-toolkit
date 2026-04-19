// @ts-check
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',

  // Run tests in files in parallel
  fullyParallel: false,
  // Retry once on CI
  retries: 0,
  // Single worker for a single-page app to keep IndexedDB state predictable
  workers: 1,

  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],

  use: {
    baseURL: 'http://localhost:8080',
    // Generous timeout — app fetches JSON on load
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],
});
