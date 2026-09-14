import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { parseAndReconcileP112EgressLog } from './server-egress';
import type { P112RunCommitment } from './tier-b';
import { P112_TIER_C_TARGET_IDS, p112TierBEgressLogPath } from './tier-b-playwright';
import { P112_TIER_B_TARGETS } from './tier-b';

const RUNNER_KEYS = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'P112_SUPABASE_CLI_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
] as const;

export function getP112TierCRuns(
  outputRoot: string,
  runCommitment: P112RunCommitment,
  signingKey: string,
  targetIds: readonly string[] = P112_TIER_C_TARGET_IDS,
) {
  if (targetIds.some((targetId) => !P112_TIER_C_TARGET_IDS.includes(targetId)))
    throw new Error('P1.12 unsupported Tier C target filter');
  return targetIds.map((targetId) => {
    const target = P112_TIER_B_TARGETS.find(({ id }) => id === targetId)!;
    const profile = ['application-confirmed', 'estimator-result', 'generic-cms-ready'].includes(
      target.id,
    )
      ? 'route-retry'
      : 'production';
    const buildPolicy = 'start-only';
    return {
      command: 'npx',
      args: ['--no-install', 'playwright', 'test', '--config', 'playwright.p1-12-tier-c.config.ts'],
      environment: {
        P112_TIER_C_TARGET_ID: target.id,
        P112_EVIDENCE_STATE_ID: target.stateId,
        P112_EVIDENCE_PROFILE: profile,
        P112_BUILD_POLICY: buildPolicy,
        P112_EGRESS_LOG_PATH: p112TierBEgressLogPath(profile, target.stateId),
        P112_TIER_B_OUTPUT_ROOT: outputRoot,
        P112_PROOF_KEY: signingKey,
        P112_PROOF_NONCE: crypto.randomUUID().replaceAll('-', ''),
        P112_RUN_COMMITMENT: JSON.stringify(runCommitment),
      },
    };
  });
}

export function runP112TierC(
  outputRoot: string,
  runCommitment: P112RunCommitment,
  signingKey: string,
  targetIds?: readonly string[],
): void {
  for (const run of getP112TierCRuns(outputRoot, runCommitment, signingKey, targetIds)) {
    const log = run.environment.P112_EGRESS_LOG_PATH;
    mkdirSync('.p1-12-acceptance-runtime/egress', { recursive: true, mode: 0o700 });
    chmodSync('.p1-12-acceptance-runtime/egress', 0o700);
    writeFileSync(log, '', { encoding: 'utf8', mode: 0o600 });
    const environment = { NODE_ENV: 'test', ...run.environment } as NodeJS.ProcessEnv;
    for (const key of RUNNER_KEYS)
      if (process.env[key] !== undefined) environment[key] = process.env[key];
    const result = spawnSync(run.command, run.args, { env: environment, stdio: 'inherit' });
    if (result.status !== 0)
      throw new Error(`P1.12 Tier C failed: ${run.environment.P112_TIER_C_TARGET_ID}`);
    parseAndReconcileP112EgressLog(
      readFileSync(log, 'utf8'),
      run.environment.P112_EVIDENCE_PROFILE,
      run.environment.P112_EVIDENCE_STATE_ID,
    );
  }
}
