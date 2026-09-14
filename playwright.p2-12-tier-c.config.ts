import { defineConfig, devices } from '@playwright/test';

const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './tests/p2-acceptance',
  testMatch: /(?:interactions|security|contrast)\.spec\.ts/u,
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: '/tmp/p2-12-tier-c-results.json' }]],
  outputDir: '/tmp/p2-12-tier-c-playwright',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3100',
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
    locale: 'en-US',
    timezoneId: 'Asia/Dubai',
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'tier-c-chromium' }],
});
