#!/usr/bin/env tsx
import { spawn } from 'node:child_process';
import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { assertLocalAcceptanceTarget, parseSupabaseStatus } from './local-target';
import {
  ACCEPTANCE_CONFIG,
  ACCEPTANCE_PROJECT_ID,
  prepareAcceptanceWorkdir,
  runSupabase,
} from './supabase-cli';

const PROJECT_ID = ACCEPTANCE_PROJECT_ID;

async function listIdentityEmails(
  apiUrl: string,
  serviceKey: string,
): Promise<Array<string | null>> {
  const admin = createClient(apiUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const emails: Array<string | null> = [];
  for (let page = 1; ; page += 1) {
    const response = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (response.error) throw new Error('P2_APP: could not verify local fixture identities');
    emails.push(...response.data.users.map((user) => user.email ?? null));
    if (response.data.users.length < 200) return emails;
  }
}

async function main() {
  const action = process.argv[2] ?? 'start';
  if (action !== 'build' && action !== 'start') throw new Error('P2_APP: expected build or start');
  await prepareAcceptanceWorkdir();
  const status = parseSupabaseStatus(runSupabase(['status', '-o', 'json']));
  const read = (key: string) => {
    const value = status[key];
    if (typeof value !== 'string' || !value) throw new Error(`P2_APP: local status missing ${key}`);
    return value;
  };
  const apiUrl = read('API_URL');
  const serviceKey = read('SERVICE_ROLE_KEY');
  const manifest = JSON.parse(await readFile('tests/.auth/p2-credentials.json', 'utf8')) as {
    encryptionKey?: string;
    roles?: Array<{ email?: string }>;
  };
  if (!manifest.encryptionKey || !Array.isArray(manifest.roles)) {
    throw new Error('P2_APP: fixture manifest is incomplete');
  }
  const configuredProject = /^project_id\s*=\s*"([^"]+)"/mu.exec(
    await readFile(ACCEPTANCE_CONFIG, 'utf8'),
  )?.[1];
  const fixtureEmails = new Set(manifest.roles.map((role) => role.email));
  const identityEmails = await listIdentityEmails(apiUrl, serviceKey);
  const unexpectedIdentityCount = identityEmails.filter(
    (email) => !email || !fixtureEmails.has(email),
  ).length;
  await assertLocalAcceptanceTarget({
    env: {
      P2_ACCEPTANCE_LOCAL_ONLY: process.env.P2_ACCEPTANCE_LOCAL_ONLY,
      NEXT_PUBLIC_SUPABASE_URL: apiUrl,
      SUPABASE_DB_URL: read('DB_URL'),
      SUPABASE_STORAGE_URL: read('STORAGE_S3_URL'),
      SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    },
    expectedProjectId: PROJECT_ID,
    actualProjectId: configuredProject ?? '',
    status,
    unexpectedIdentityCount,
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
        NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:3100',
        P2_ACCEPTANCE_LOCAL_ONLY: '1',
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
