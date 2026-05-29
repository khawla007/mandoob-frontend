import { defineConfig, devices } from '@playwright/test';

// Single canonical knob: E2E_BASE_URL (matches the launch checklist + .env.example).
// LAUNCH_BASE_URL is kept as a deprecated fallback so older runner configs do
// not break mid-launch — remove after the chore/launch-readiness cycle ships.
// deprecated, use E2E_BASE_URL
const baseURL = process.env.E2E_BASE_URL ?? process.env.LAUNCH_BASE_URL ?? 'http://localhost:3100';
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
    // Setup project: signs in once per role, writes tests/.auth/<role>.json.
    // Authenticated specs declare a dependency on this project; the public
    // spec does not, so unauthenticated routes keep running even when seed
    // creds are unset.
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'public-a11y',
      testMatch: /a11y\/launch-routes\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'public-questionnaire-smoke',
      testMatch: /smoke\/public-questionnaire\.spec\.ts/,
    },
    {
      name: 'authenticated-a11y',
      testMatch: /a11y\/authenticated-routes\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
