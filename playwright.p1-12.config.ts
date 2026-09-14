import { defineConfig } from '@playwright/test';
import {
  P112_TIER_A_CLIENT_JOURNEYS,
  P112_TIER_A_RENDERED_CASES,
  P112_EVIDENCE_PROFILE_ENV,
  type P112EvidenceProfile,
} from './scripts/p1-12-acceptance/tier-a-manifest';

const baseURL = 'http://127.0.0.1:3001';
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const requestedProfile = process.env.P112_EVIDENCE_PROFILE ?? 'production';
if (!(requestedProfile in P112_EVIDENCE_PROFILE_ENV)) {
  throw new Error('P1.12 unsupported evidence profile');
}
const evidenceProfile = requestedProfile as P112EvidenceProfile;
const evidenceStateId = process.env.P112_EVIDENCE_STATE_ID;
if (
  !evidenceStateId ||
  !/^S\d{3}$/u.test(evidenceStateId) ||
  ![
    ...P112_TIER_A_RENDERED_CASES.map(({ stateId }) => stateId),
    ...P112_TIER_A_CLIENT_JOURNEYS.map(({ stateId }) => stateId),
  ].includes(evidenceStateId)
)
  throw new Error('P1.12 unsupported evidence state');
const buildPolicy = process.env.P112_BUILD_POLICY;
if (buildPolicy !== 'build' && buildPolicy !== 'start-only')
  throw new Error('P1.12 unsupported build policy');
const egressLogPath = `.p1-12-acceptance-runtime/egress/${evidenceProfile}-${evidenceStateId}.jsonl`;
const appMode = evidenceProfile === 'production' ? 'production' : 'development';
const variants = [
  { name: 'en-light-1440x900', theme: 'light', viewport: { width: 1440, height: 900 } },
  { name: 'en-dark-1440x900', theme: 'dark', viewport: { width: 1440, height: 900 } },
  { name: 'en-light-1280x800', theme: 'light', viewport: { width: 1280, height: 800 } },
  { name: 'en-dark-1280x800', theme: 'dark', viewport: { width: 1280, height: 800 } },
] as const;

export default defineConfig({
  testDir: './tests/p1-12-acceptance',
  testMatch: /tier-a\.spec\.ts/u,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: 'test-results/p1-12',
  reporter: [['list'], ['json', { outputFile: 'test-results/p1-12-tier-a.json' }]],
  use: {
    baseURL,
    locale: 'en-AE',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
  },
  webServer: {
    command: `P112_ACCEPTANCE_LOCAL_ONLY=1 P112_EVIDENCE_STATE_ID=${evidenceStateId} P112_EGRESS_LOG_PATH=${egressLogPath} P112_BUILD_POLICY=${buildPolicy} node --import tsx scripts/p1-12-acceptance/run-app.ts --mode ${appMode} --profile ${evidenceProfile}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: variants.map(({ name, theme, viewport }) => ({
    name,
    metadata: { p112Theme: theme, p112EvidenceProfile: evidenceProfile },
    use: { viewport, colorScheme: theme },
  })),
});
