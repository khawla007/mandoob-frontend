import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  assembleP112TierBProvisional,
  finalizeP112TierBEvidence,
  finalizeP112TierBShardReviews,
} from './tier-b-runner';
import { createP112TierCHandoff, getP112TierBDirectRuns } from './tier-b-playwright';
import { parseAndReconcileP112EgressLog } from './server-egress';
import { createP112RunCommitment, P112_ACCEPTED_BASE_SHA } from './tier-b';
import { writeP112AtomicPrivateFile } from './tier-b-fs';
import { runP112TierC } from './tier-c-runner';

const RUNNER_KEYS = [
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SystemRoot',
  'P112_SUPABASE_CLI_PATH',
  'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
] as const;
function buildRunnerEnvironment(run: Record<string, string>): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: 'test', ...run };
  for (const key of RUNNER_KEYS) if (process.env[key] !== undefined) result[key] = process.env[key];
  return result;
}

function currentRunContext() {
  const signingKey = process.env.P112_PROOF_KEY;
  const runId = process.env.P112_RUN_ID;
  const acceptedBaseSha = process.env.P112_ACCEPTED_BASE_SHA;
  if (!signingKey || !runId || !acceptedBaseSha)
    throw new Error('P1.12 run requires P112_PROOF_KEY, P112_RUN_ID, and P112_ACCEPTED_BASE_SHA');
  if (acceptedBaseSha !== P112_ACCEPTED_BASE_SHA)
    throw new Error(`P1.12 accepted base must be ${P112_ACCEPTED_BASE_SHA}`);
  const candidateSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const ancestry = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', P112_ACCEPTED_BASE_SHA, candidateSha],
    { stdio: 'ignore' },
  );
  if (ancestry.status !== 0)
    throw new Error('P1.12 candidate is not descended from the accepted base');
  const dirty = execFileSync('git', ['diff', '--binary', 'HEAD'], { encoding: 'utf8' });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z']);
  const hasher = createHash('sha256').update(dirty).update(untracked);
  for (const file of untracked.toString('utf8').split('\0').filter(Boolean)) {
    hasher.update(file).update(readFileSync(file));
  }
  const digest = hasher.digest('hex');
  return {
    signingKey,
    runCommitment: createP112RunCommitment({
      runId,
      acceptedBaseSha,
      candidateSha,
      candidateDigest: digest,
      candidateDescendsFromAcceptedBase: true,
      signingKey,
    }),
  };
}

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`P1.12 missing ${name}`);
  return path.resolve(value);
}

function optionalValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (index >= 0 && (!value || value.startsWith('--'))) throw new Error(`P1.12 missing ${name}`);
  return value;
}

export async function runP112TierBCli(): Promise<void> {
  const command = process.argv[2];
  const outputRoot = option('--output');
  const repositoryRoot = path.resolve(process.cwd(), '../../..');
  const run = currentRunContext();
  switch (command) {
    case 'direct': {
      for (const browserRun of getP112TierBDirectRuns(
        outputRoot,
        run.runCommitment,
        run.signingKey,
      )) {
        const log = browserRun.environment.P112_EGRESS_LOG_PATH;
        mkdirSync(path.dirname(log), { recursive: true, mode: 0o700 });
        writeFileSync(log, '', { mode: 0o600 });
        const result = spawnSync(browserRun.command, browserRun.args, {
          env: buildRunnerEnvironment(browserRun.environment),
          stdio: 'inherit',
        });
        if (result.status !== 0) throw new Error('P1.12 Tier B direct Playwright shard failed');
        parseAndReconcileP112EgressLog(
          readFileSync(log, 'utf8'),
          browserRun.environment.P112_EVIDENCE_PROFILE,
          browserRun.environment.P112_EVIDENCE_STATE_ID,
        );
      }
      await assembleP112TierBProvisional({
        owner: 'tier-b-direct',
        outputRoot,
        repositoryRoot,
      });
      break;
    }
    case 'tier-c-handoff': {
      const handoff = createP112TierCHandoff(outputRoot, run.runCommitment);
      await writeP112AtomicPrivateFile(
        outputRoot,
        path.join(outputRoot, 'tier-c-handoff.json'),
        `${JSON.stringify(handoff, null, 2)}\n`,
      );
      await assembleP112TierBProvisional({
        owner: 'tier-c-prepared',
        outputRoot,
        repositoryRoot,
      });
      break;
    }
    case 'tier-c': {
      const onlyTarget = optionalValue('--only-target');
      runP112TierC(
        outputRoot,
        run.runCommitment,
        run.signingKey,
        onlyTarget ? [onlyTarget] : undefined,
      );
      if (onlyTarget) break;
      await assembleP112TierBProvisional({
        owner: 'tier-c-prepared',
        outputRoot,
        repositoryRoot,
      });
      break;
    }
    case 'finalize': {
      const reviewInput = option('--review-input');
      await finalizeP112TierBShardReviews({
        owner: 'tier-b-direct',
        outputRoot,
        repositoryRoot,
        reviewInput,
        signingKey: run.signingKey,
      });
      await finalizeP112TierBShardReviews({
        owner: 'tier-c-prepared',
        outputRoot,
        repositoryRoot,
        reviewInput,
        signingKey: run.signingKey,
      });
      await finalizeP112TierBEvidence({ outputRoot, signingKey: run.signingKey });
      break;
    }
    default:
      throw new Error('P1.12 command must be direct, tier-c, tier-c-handoff, or finalize');
  }
}

if (process.argv[1]?.endsWith('tier-b-cli.ts')) {
  void runP112TierBCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
