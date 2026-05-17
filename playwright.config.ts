import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.LAUNCH_BASE_URL ?? 'http://localhost:3100';
const launchUrl = new URL(baseURL);
const launchRootDomain = launchUrl.host;
const launchPort = launchUrl.port || '3000';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: process.env.LAUNCH_SKIP_WEB_SERVER
    ? undefined
    : {
        command: `NEXT_PUBLIC_ROOT_DOMAIN=${launchRootDomain} npm run dev -- -p ${launchPort}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
