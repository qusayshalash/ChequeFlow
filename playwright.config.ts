import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a running stack.
 *
 * `channel: 'chrome'` drives the Chrome already installed on the machine
 * rather than Playwright's own download: this repo is developed on a host with
 * no container runtime and a metered link, and a 150MB browser bundle per
 * checkout is a poor trade for a suite that only needs one Chromium.
 *
 * Credentials come from the environment, never from the repo. Point
 * E2E_BASE_URL / E2E_API_URL at a disposable stack — the suite writes and
 * deletes records, and every one it creates is named `QA_TEST_…` so anything
 * it leaves behind is identifiable.
 */
export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'ar',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
});
