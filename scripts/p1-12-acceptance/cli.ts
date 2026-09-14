import { spawn } from 'node:child_process';
import { basename, isAbsolute, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { createAuthFixture, createPostgresFixtureStore } from './adapters';
import { P112_TARGET } from './contract';
import { assertP112Target } from './guard-config';
import { setupFixture, teardownFixture, verifyFixtureBaseline } from './lifecycle';
import { cleanupRuntimeProject, prepareRuntimeProject } from './runtime-project';
import { createSecretStore } from './secrets';

const runtimeRoot = join(process.cwd(), '.p1-12-acceptance-runtime');

function safeLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

function run(file: string, args: readonly string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('P1.12 local command could not start')));
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error('P1.12 local command failed'));
    });
    child.stdin.end(stdin);
  });
}

function supabaseExecutable(): string {
  const configured = process.env.P112_SUPABASE_CLI_PATH;
  if (!configured) return 'supabase';
  if (!isAbsolute(configured) || basename(configured) !== 'supabase') {
    throw new Error('P1.12 Supabase CLI path rejected');
  }
  return configured;
}

async function containerIdsForProject(all = false): Promise<string[]> {
  const output = await run('docker', [
    'ps',
    ...(all ? ['--all'] : []),
    '--filter',
    `label=com.supabase.cli.project=${P112_TARGET.projectId}`,
    '--format',
    '{{.ID}}',
  ]);
  const ids = output.trim() ? output.trim().split(/\s+/u) : [];
  if (ids.some((id) => !/^[0-9a-f]{12,64}$/u.test(id))) {
    throw new Error('P1.12 container identity unreadable');
  }
  return ids;
}

async function networkNamesForProject(): Promise<string[]> {
  const output = await run('docker', [
    'network',
    'ls',
    '--filter',
    `label=com.supabase.cli.project=${P112_TARGET.projectId}`,
    '--format',
    '{{.Name}}',
  ]);
  const names = output.trim() ? output.trim().split(/\s+/u) : [];
  if (names.some((name) => name !== P112_TARGET.networkName)) {
    throw new Error('P1.12 network identity unreadable');
  }
  return names;
}

async function createLoopbackNetwork(): Promise<void> {
  await run('docker', [
    'network',
    'create',
    '--driver',
    'bridge',
    '--label',
    `com.supabase.cli.project=${P112_TARGET.projectId}`,
    '--opt',
    'com.docker.network.bridge.host_binding_ipv4=127.0.0.1',
    P112_TARGET.networkName,
  ]);
}

async function inspectLoopbackNetwork(): Promise<unknown> {
  const names = await networkNamesForProject();
  if (names.length !== 1) throw new Error('P1.12 isolated network missing');
  return JSON.parse(
    await run('docker', ['network', 'inspect', P112_TARGET.networkName]),
  ) as unknown;
}

async function verifiedDependencies() {
  const status = await run(supabaseExecutable(), [
    'status',
    '-o',
    'json',
    '--workdir',
    runtimeRoot,
  ]);
  const containerIds = await containerIdsForProject();
  if (containerIds.length === 0) throw new Error('P1.12 project containers missing');
  const inspectJson = await run('docker', ['inspect', ...containerIds]);
  let inspect: unknown;
  try {
    inspect = JSON.parse(inspectJson);
  } catch {
    throw new Error('P1.12 container inspection unreadable');
  }
  const targetSecrets = assertP112Target({
    env: process.env,
    status,
    inspect,
    network: await inspectLoopbackNetwork(),
  });
  const client = createClient(P112_TARGET.apiOrigin, targetSecrets.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    guard: { projectId: P112_TARGET.projectId },
    store: createPostgresFixtureStore(run),
    auth: createAuthFixture(client),
    secrets: createSecretStore(runtimeRoot),
    log: safeLog,
  };
}

async function main(): Promise<void> {
  const action = process.argv[2];
  if (!['prepare', 'setup', 'verify', 'teardown', 'cleanup-project'].includes(action ?? '')) {
    throw new Error('Usage: cli.ts prepare|setup|verify|teardown|cleanup-project');
  }
  if (process.env.P112_ACCEPTANCE_LOCAL_ONLY !== '1') {
    throw new Error('P1.12 explicit local-only opt-in missing');
  }
  if (action === 'prepare') {
    if ((await containerIdsForProject(true)).length > 0) {
      throw new Error('P1.12 refusing prepare while project containers exist');
    }
    if ((await networkNamesForProject()).length > 0) {
      throw new Error('P1.12 refusing prepare while project network exists');
    }
    await prepareRuntimeProject({
      sourceSupabaseDirectory: join(process.cwd(), 'supabase'),
      runtimeRoot,
    });
    await createLoopbackNetwork();
    safeLog('P1.12 temporary project prepared');
    return;
  }
  if (action === 'cleanup-project') {
    if ((await containerIdsForProject(true)).length > 0) {
      throw new Error('P1.12 refusing cleanup while project containers exist');
    }
    if ((await networkNamesForProject()).length === 1) {
      await run('docker', ['network', 'rm', P112_TARGET.networkName]);
    }
    await cleanupRuntimeProject(runtimeRoot);
    safeLog('P1.12 temporary project artifacts removed');
    return;
  }
  const dependencies = await verifiedDependencies();
  if (action === 'setup') await setupFixture(dependencies);
  if (action === 'verify') await verifyFixtureBaseline(dependencies);
  if (action === 'teardown') await teardownFixture(dependencies);
}

main().catch(() => {
  process.stderr.write('P1.12 fixture command failed; no secret detail was emitted.\n');
  process.exitCode = 1;
});
