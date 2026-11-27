import { defineConfig, devices } from '@playwright/test';

// E2E tests drive the LIVE preview deploy: the branch push ships the app and
// these tests then walk it as a real user would. The authenticated portal
// suites join batch by batch; today's suite is public-surface smoke.
const BASE_URL = process.env.E2E_BASE_URL || 'https://deploy-preview-5--tutorialos.netlify.app';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'smoke', use: { ...devices['Desktop Chrome'] } },
  ],
});
