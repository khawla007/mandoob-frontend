import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { P112_TARGET } from './contract';
import { assertP112Target } from './guard-config';
import { P112_EVIDENCE_PROFILE_ENV, type P112EvidenceProfile } from './tier-a-manifest';
import { serverEgressNodeOptions } from './server-egress';

export type P112AppMode = 'production' | 'development';
export type P112BuildPolicy = 'build' | 'start-only';
type StatusSecrets = ReturnType<typeof assertP112Target>;

const SAFE_PROCESS_KEYS = ['PATH', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot'] as const;

export function createP112EphemeralEncryptionKey(generate = randomBytes): string {
  const bytes = generate(32);
  if (bytes.byteLength !== 32) throw new Error('P1.12 encryption key generation failed');
  return Buffer.from(bytes).toString('base64');
}

export function parseP112AppMode(argv: readonly string[]): P112AppMode {
  const index = argv.indexOf('--mode');
  if (index === -1 || !argv[index + 1]) throw new Error('P1.12 app requires explicit --mode');
  const value = argv[index + 1];
  if (value !== 'production' && value !== 'development') {
    throw new Error('P1.12 app received unsupported mode');
  }
  return value;
}

export function parseP112EvidenceProfile(argv: readonly string[]): P112EvidenceProfile {
  const index = argv.indexOf('--profile');
  if (index === -1 || !argv[index + 1]) throw new Error('P1.12 app requires explicit --profile');
  const value = argv[index + 1];
  if (!(value in P112_EVIDENCE_PROFILE_ENV))
    throw new Error('P1.12 app received unsupported profile');
  return value as P112EvidenceProfile;
}

export function buildP112AppEnvironment(
  source: Record<string, string | undefined>,
  secrets: StatusSecrets,
  mode: P112AppMode,
  profile: P112EvidenceProfile = 'production',
  encryptionKey = createP112EphemeralEncryptionKey(),
): NodeJS.ProcessEnv {
  const stateId = source.P112_EVIDENCE_STATE_ID;
  const evidenceLog = source.P112_EGRESS_LOG_PATH;
  if (!stateId || !/^S\d{3}$/u.test(stateId))
    throw new Error('P1.12 app requires exact evidence state');
  if (evidenceLog !== `.p1-12-acceptance-runtime/egress/${profile}-${stateId}.jsonl`)
    throw new Error('P1.12 app egress log identity rejected');
  const environment = {} as NodeJS.ProcessEnv;
  for (const key of SAFE_PROCESS_KEYS) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  return {
    ...environment,
    NODE_ENV: mode,
    NODE_OPTIONS: serverEgressNodeOptions(),
    NEXT_TELEMETRY_DISABLED: '1',
    P112_ACCEPTANCE_LOCAL_ONLY: '1',
    P112_EGRESS_LOG_PATH: evidenceLog,
    P112_EVIDENCE_PROFILE: profile,
    P112_EVIDENCE_STATE_ID: stateId,
    P112_EGRESS_INITIATOR: 'app',
    NEXT_PUBLIC_APP_URL: P112_TARGET.appOrigin,
    NEXT_PUBLIC_ROOT_DOMAIN: '127.0.0.1:3001',
    NEXT_PUBLIC_SUPABASE_URL: P112_TARGET.apiOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: secrets.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: secrets.serviceRoleKey,
    DATABASE_URL: P112_TARGET.databaseUrl,
    ENCRYPTION_KEY: encryptionKey,
    ...(mode === 'development' ? { WATCHPACK_POLLING: 'true' } : {}),
    ...P112_EVIDENCE_PROFILE_ENV[profile],
  };
}

export function getP112AppCommands(mode: P112AppMode, buildPolicy: P112BuildPolicy = 'build') {
  return mode === 'production'
    ? buildPolicy === 'build'
      ? [
          { command: './node_modules/.bin/next', args: ['build', '--webpack'] },
          { command: 'npm', args: ['run', 'start', '--', '-H', '127.0.0.1'] },
        ]
      : [{ command: 'npm', args: ['run', 'start', '--', '-H', '127.0.0.1'] }]
    : [{ command: 'npm', args: ['run', 'dev', '--', '--webpack', '-H', '127.0.0.1'] }];
}

export function prepareP112DevelopmentApp(mode: P112AppMode, distDir: string): void {
  if (mode !== 'development') return;
  const cacheDir = resolve(distDir, 'dev', 'cache');
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    resolve(cacheDir, 'next-devtools-config.json'),
    JSON.stringify({ disableDevIndicator: true }),
    { encoding: 'utf8', mode: 0o600 },
  );
}

function capture(command: string, args: readonly string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function resolveP112SupabaseExecutable(configured: string | undefined): string {
  if (!configured) return 'supabase';
  if (!isAbsolute(configured) || basename(configured) !== 'supabase') {
    throw new Error('P1.12 Supabase CLI path rejected');
  }
  return configured;
}

function readGuardedTarget(runtimeRoot: string): StatusSecrets {
  const command = resolveP112SupabaseExecutable(process.env.P112_SUPABASE_CLI_PATH);
  const status = capture(command, ['status', '--output', 'json', '--workdir', runtimeRoot]);
  const names = capture('docker', [
    'ps',
    '--filter',
    `label=com.supabase.cli.project=${P112_TARGET.projectId}`,
    '--format',
    '{{.Names}}',
  ])
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (names.length === 0) throw new Error('P1.12 local target rejected: no project containers');
  const inspect = JSON.parse(capture('docker', ['inspect', ...names])) as unknown;
  const network = JSON.parse(
    capture('docker', ['network', 'inspect', P112_TARGET.networkName]),
  ) as unknown;
  return assertP112Target({ env: process.env, status, inspect, network });
}

function runChild(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolveChild, reject) => {
    const child: ChildProcess = spawn(command, args, { env, stdio: 'inherit' });
    let stopping = false;
    const forward = (signal: NodeJS.Signals) => {
      stopping = true;
      child.kill(signal);
    };
    const onSigint = () => forward('SIGINT');
    const onSigterm = () => forward('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      if (code === 0 || stopping) resolveChild();
      else reject(new Error(`P1.12 app child exited (${signal ?? code ?? 'unknown'})`));
    });
  });
}

export async function runP112App(argv = process.argv.slice(2)): Promise<void> {
  const mode = parseP112AppMode(argv);
  const profile = parseP112EvidenceProfile(argv);
  const buildPolicy = process.env.P112_BUILD_POLICY;
  if (buildPolicy !== 'build' && buildPolicy !== 'start-only')
    throw new Error('P1.12 app build policy rejected');
  const runtimeRoot = resolve('.p1-12-acceptance-runtime');
  if (!existsSync(resolve(runtimeRoot, 'supabase/config.toml'))) {
    throw new Error('P1.12 runtime project is not prepared');
  }
  const environment = buildP112AppEnvironment(
    process.env,
    readGuardedTarget(runtimeRoot),
    mode,
    profile,
    createP112EphemeralEncryptionKey(),
  );
  prepareP112DevelopmentApp(mode, resolve('.next'));
  for (const step of getP112AppCommands(mode, buildPolicy)) {
    await runChild(step.command, step.args, environment);
  }
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (entry === import.meta.url) {
  runP112App().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'P1.12 app runner failed');
    process.exitCode = 1;
  });
}
