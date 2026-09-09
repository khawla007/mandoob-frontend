#!/usr/bin/env tsx
import { execFileSync, spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { assertLocalAcceptanceTarget, parseSupabaseStatus } from './local-target';

const CLI = '/home/ashish-khawla/.npm/_npx/9bc4605d2fcd4ce9/node_modules/supabase/bin/supabase';
const PROJECT_ID = 'mandoob-p2-12-acceptance';

async function main() {
  const action = process.argv[2] ?? 'start';
  if (action !== 'build' && action !== 'start') throw new Error('P2_APP: expected build or start');
  const status = parseSupabaseStatus(
    execFileSync(CLI, ['status', '-o', 'json'], { encoding: 'utf8' }),
  );
  const read = (key: string) => {
    const value = status[key];
    if (typeof value !== 'string' || !value) throw new Error(`P2_APP: local status missing ${key}`);
    return value;
  };
  const apiUrl = read('API_URL');
  const serviceKey = read('SERVICE_ROLE_KEY');
  const manifest = JSON.parse(await readFile('tests/.auth/p2-credentials.json', 'utf8')) as {
    encryptionKey?: string;
  };
  if (!manifest.encryptionKey) throw new Error('P2_APP: fixture encryption key missing');
  await assertLocalAcceptanceTarget({
    env: {
      P2_ACCEPTANCE_LOCAL_ONLY: process.env.P2_ACCEPTANCE_LOCAL_ONLY,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_DB_URL: read('DB_URL'),
      SUPABASE_STORAGE_URL: read('STORAGE_S3_URL'),
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    },
    expectedProjectId: PROJECT_ID,
    actualProjectId: PROJECT_ID,
    status,
    unexpectedIdentityCount: 0,
    resolveHost: async (host) => (await lookup(host, { all: true })).map(({ address }) => address),
  });
  const child = spawn(
    resolve(process.cwd(), 'node_modules/.bin/next'),
    action === 'build' ? ['build'] : ['start', '-H', '127.0.0.1', '-p', '3100'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: read('ANON_KEY'),
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        ENCRYPTION_KEY: manifest.encryptionKey,
        NEXT_PUBLIC_ROOT_DOMAIN: '127.0.0.1:3100',
      },
    },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  child.on('exit', (code) => process.exit(code ?? 1));
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'P2_APP: failed'}\n`);
  process.exitCode = 1;
});
