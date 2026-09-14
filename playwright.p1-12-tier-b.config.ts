import { defineConfig } from '@playwright/test';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

import { P112_TIER_B_TARGETS } from './scripts/p1-12-acceptance/tier-b';
import { p112TierBEgressLogPath } from './scripts/p1-12-acceptance/tier-b-playwright';
import {
  P112_EVIDENCE_PROFILE_ENV,
  type P112EvidenceProfile,
} from './scripts/p1-12-acceptance/tier-a-manifest';

const baseURL = 'http://127.0.0.1:3001';
const stateId = process.env.P112_EVIDENCE_STATE_ID;
const requestedProfile = process.env.P112_EVIDENCE_PROFILE;
const buildPolicy = process.env.P112_BUILD_POLICY;
if (
  !stateId ||
  !P112_TIER_B_TARGETS.some(
    (target) => target.owner === 'tier-b-direct' && target.stateId === stateId,
  )
)
  throw new Error('P1.12 unsupported Tier B direct state');
if (!requestedProfile || !(requestedProfile in P112_EVIDENCE_PROFILE_ENV))
  throw new Error('P1.12 unsupported evidence profile');
if (buildPolicy !== 'build' && buildPolicy !== 'start-only')
  throw new Error('P1.12 unsupported build policy');
for (const key of [
  'P112_TIER_B_OUTPUT_ROOT',
  'P112_PROOF_KEY',
  'P112_PROOF_NONCE',
  'P112_EGRESS_LOG_PATH',
  'P112_RUN_COMMITMENT',
])
  if (!process.env[key]) throw new Error(`P1.12 missing ${key}`);
const profile = requestedProfile as P112EvidenceProfile;
const appMode = profile === 'production' ? 'production' : 'development';
const egressLogPath = process.env.P112_EGRESS_LOG_PATH;
if (egressLogPath !== p112TierBEgressLogPath(profile, stateId))
  throw new Error('P1.12 Tier B egress log identity rejected');
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if (chromiumExecutablePath && !path.isAbsolute(chromiumExecutablePath))
  throw new Error('P1.12 Chromium executable path must be absolute');
if (chromiumExecutablePath) {
  try {
    accessSync(chromiumExecutablePath, constants.X_OK);
  } catch {
    throw new Error('P1.12 Chromium executable path must be an executable file');
  }
}
const variants = [
  { name: 'en-light-1440x900', theme: 'light', viewport: { width: 1440, height: 900 } },
  { name: 'en-dark-1440x900', theme: 'dark', viewport: { width: 1440, height: 900 } },
  { name: 'en-light-1280x800', theme: 'light', viewport: { width: 1280, height: 800 } },
  { name: 'en-dark-1280x800', theme: 'dark', viewport: { width: 1280, height: 800 } },
] as const;

export default defineConfig({
  testDir: './tests/p1-12-acceptance',
  testMatch: 'tier-b.spec.ts',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: 'test-results/p1-12-tier-b',
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'en-AE',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    launchOptions: chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : undefined,
  },
  webServer: {
    command: `P112_ACCEPTANCE_LOCAL_ONLY=1 P112_EVIDENCE_STATE_ID=${stateId} P112_EGRESS_LOG_PATH=${egressLogPath} P112_BUILD_POLICY=${buildPolicy} node --import tsx scripts/p1-12-acceptance/run-app.ts --mode ${appMode} --profile ${profile}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: variants.map(({ name, theme, viewport }) => ({
    name,
    metadata: { p112Theme: theme },
    use: { viewport, colorScheme: theme },
  })),
});
