import { defineConfig, devices } from '@playwright/test';

import { resolveReducedBrowserExecutable } from './scripts/p3-13-acceptance/browser-executable';

const baseURL = process.env.P3_13_AUTH_BASE_URL ?? 'http://127.0.0.1:3113';
const executablePath = resolveReducedBrowserExecutable(process.env);

export default defineConfig({
  testDir: './tests/p3-13-acceptance',
  outputDir: '.p3-13-auth-test-results',
  testMatch: /reduced-auth\.spec\.ts/u,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    launchOptions: executablePath ? { executablePath } : undefined,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
});
