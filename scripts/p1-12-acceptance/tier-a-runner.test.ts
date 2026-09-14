import assert from 'node:assert/strict';
import test from 'node:test';

import { buildP112RunnerEnvironment, getP112TierARuns, p112EgressLogPath } from './tier-a-runner';

const contrastLogPath = '.p1-12-acceptance-runtime/contrast-ratios.jsonl';

test('runs every immutable evidence profile sequentially with the exact config', () => {
  const runs = getP112TierARuns();
  assert.equal(
    new Set(
      runs.map(
        ({ environment }) =>
          `${environment.P112_EVIDENCE_PROFILE}:${environment.P112_EVIDENCE_STATE_ID}`,
      ),
    ).size,
    runs.length,
  );
  assert.equal(
    runs.filter(({ environment }) => environment.P112_BUILD_POLICY === 'build').length,
    1,
  );
  assert.deepEqual(runs[0]?.environment, {
    P112_EVIDENCE_PROFILE: 'production',
    P112_EVIDENCE_STATE_ID: 'S136',
    P112_BUILD_POLICY: 'build',
    P112_EGRESS_LOG_PATH: p112EgressLogPath('production', 'S136'),
    P112_CONTRAST_LOG_PATH: contrastLogPath,
  });
  const firstDevelopment = runs.findIndex(
    ({ environment }) => environment.P112_EVIDENCE_PROFILE !== 'production',
  );
  assert.ok(firstDevelopment > 0);
  assert.ok(
    runs
      .slice(0, firstDevelopment)
      .every(({ environment }) => environment.P112_EVIDENCE_PROFILE === 'production'),
  );
  assert.ok(
    runs
      .slice(firstDevelopment)
      .every(({ environment }) => environment.P112_EVIDENCE_PROFILE !== 'production'),
  );
  assert.ok(
    runs
      .slice(1, firstDevelopment)
      .every(({ environment }) => environment.P112_BUILD_POLICY === 'start-only'),
  );
  assert.ok(
    runs.every(
      ({ command, args }) =>
        command === 'npx' &&
        args.join(' ') === '--no-install playwright test --config playwright.p1-12.config.ts',
    ),
  );
  assert.ok(
    runs.every(
      ({ environment }, index) =>
        environment.P112_EGRESS_LOG_PATH ===
        p112EgressLogPath(
          runs[index]!.environment.P112_EVIDENCE_PROFILE,
          runs[index]!.environment.P112_EVIDENCE_STATE_ID,
        ),
    ),
  );
  assert.ok(
    runs.every(({ environment }) => environment.P112_CONTRAST_LOG_PATH === contrastLogPath),
  );
});

test('runner strips inherited provider, proxy, telemetry, and secret variables', () => {
  const environment = buildP112RunnerEnvironment(
    {
      PATH: '/usr/bin',
      TMPDIR: '/tmp/p112',
      P112_SUPABASE_CLI_PATH: '/opt/supabase',
      PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: '/opt/chromium',
      HOME: '/private',
      HTTPS_PROXY: 'remote',
      SENTRY_DSN: 'secret',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
      ENCRYPTION_KEY: 'project-secret',
    },
    getP112TierARuns()[0]!.environment,
  );
  assert.deepEqual(Object.keys(environment).sort(), [
    'NODE_ENV',
    'P112_BUILD_POLICY',
    'P112_CONTRAST_LOG_PATH',
    'P112_EGRESS_LOG_PATH',
    'P112_EVIDENCE_PROFILE',
    'P112_EVIDENCE_STATE_ID',
    'P112_SUPABASE_CLI_PATH',
    'PATH',
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
    'TMPDIR',
  ]);
  assert.equal(environment.NODE_ENV, 'test');
});
