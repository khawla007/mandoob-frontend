import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { parseAndReconcileP112EgressLog } from './server-egress';
import { P112_TIER_A_CLIENT_JOURNEYS, P112_TIER_A_RENDERED_CASES } from './tier-a-manifest';

export function p112EgressLogPath(profile: string, stateId: string): string {
  if (!/^[a-z-]+$/u.test(profile) || !/^S\d{3}$/u.test(stateId))
    throw new Error('P1.12 egress log identity rejected');
  return `.p1-12-acceptance-runtime/egress/${profile}-${stateId}.jsonl`;
}

const P112_CONTRAST_LOG_PATH = '.p1-12-acceptance-runtime/contrast-ratios.jsonl';

export function getP112TierARuns() {
  const identities = new Map(
    P112_TIER_A_RENDERED_CASES.map(({ profile, stateId }) => [
      `${profile}:${stateId}`,
      { profile, stateId },
    ]),
  );
  for (const { stateId } of P112_TIER_A_CLIENT_JOURNEYS)
    identities.set(`production:${stateId}`, { profile: 'production', stateId });
  let firstProduction = true;
  const rank = ({ profile, stateId }: { profile: string; stateId: string }) =>
    profile === 'production' && stateId === 'S136' ? 0 : profile === 'production' ? 1 : 2;
  return [...identities.values()]
    .sort((left, right) => rank(left) - rank(right))
    .map(({ profile, stateId }) => {
      const buildPolicy = profile === 'production' && firstProduction ? 'build' : 'start-only';
      if (profile === 'production') firstProduction = false;
      return {
        command: 'npx',
        args: ['--no-install', 'playwright', 'test', '--config', 'playwright.p1-12.config.ts'],
        environment: {
          P112_EVIDENCE_PROFILE: profile,
          P112_EVIDENCE_STATE_ID: stateId,
          P112_BUILD_POLICY: buildPolicy,
          P112_EGRESS_LOG_PATH: p112EgressLogPath(profile, stateId),
          P112_CONTRAST_LOG_PATH,
        },
      };
    });
}

const RUNNER_KEYS = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'P112_SUPABASE_CLI_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
] as const;
export function buildP112RunnerEnvironment(
  source: Record<string, string | undefined>,
  run: Record<string, string>,
): NodeJS.ProcessEnv {
  const result = { NODE_ENV: 'test', ...run } as NodeJS.ProcessEnv;
  for (const key of RUNNER_KEYS) if (source[key] !== undefined) result[key] = source[key];
  return result;
}

export function runP112TierA(): void {
  mkdirSync('.p1-12-acceptance-runtime', { recursive: true, mode: 0o700 });
  chmodSync('.p1-12-acceptance-runtime', 0o700);
  writeFileSync(P112_CONTRAST_LOG_PATH, '', { encoding: 'utf8', mode: 0o600 });
  for (const run of getP112TierARuns()) {
    mkdirSync('.p1-12-acceptance-runtime/egress', { recursive: true, mode: 0o700 });
    chmodSync('.p1-12-acceptance-runtime/egress', 0o700);
    writeFileSync(run.environment.P112_EGRESS_LOG_PATH, '', { encoding: 'utf8', mode: 0o600 });
    const result = spawnSync(run.command, run.args, {
      env: buildP112RunnerEnvironment(process.env, run.environment),
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error('P1.12 Tier A evidence profile failed');
    parseAndReconcileP112EgressLog(
      readFileSync(run.environment.P112_EGRESS_LOG_PATH, 'utf8'),
      run.environment.P112_EVIDENCE_PROFILE,
      run.environment.P112_EVIDENCE_STATE_ID,
    );
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) runP112TierA();
