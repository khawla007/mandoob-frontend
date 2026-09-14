import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import * as runAppModule from './run-app';

import { P112_TARGET } from './contract';
import {
  buildP112AppEnvironment,
  createP112EphemeralEncryptionKey,
  getP112AppCommands,
  parseP112AppMode,
  parseP112EvidenceProfile,
  resolveP112SupabaseExecutable,
} from './run-app';

const statusSecrets = {
  anonKey: 'local-anon-secret',
  serviceRoleKey: 'local-service-secret',
};

test('builds an allowlisted child environment and injects only the guarded local target', () => {
  const result = buildP112AppEnvironment(
    {
      PATH: '/usr/bin',
      HOME: '/private/home',
      NODE_OPTIONS: '--require=/private/hook.js',
      HTTPS_PROXY: 'https://remote.invalid',
      HTTP_PROXY: 'http://remote.invalid',
      ALL_PROXY: 'socks://remote.invalid',
      NO_PROXY: '*',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'https://telemetry.invalid',
      SENTRY_DSN: 'https://telemetry.invalid/1',
      VERCEL_ANALYTICS_ID: 'remote-analytics',
      P112_SUPABASE_CLI_PATH: '/private/supabase',
      TMPDIR: '/tmp/p112',
      NEXT_PUBLIC_SUPABASE_URL: 'https://remote.invalid',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'remote-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'remote-service',
      NEXT_PUBLIC_ROOT_DOMAIN: 'remote.invalid',
      DATABASE_URL: 'postgresql://remote.invalid/database',
      ENCRYPTION_KEY: 'inherited-project-secret',
      NEXT_TELEMETRY_DISABLED: '0',
      WATCHPACK_POLLING: 'false',
      P112_EVIDENCE_STATE_ID: 'S007',
      P112_EGRESS_LOG_PATH: '.p1-12-acceptance-runtime/egress/production-S007.jsonl',
    },
    statusSecrets,
    'production',
  );

  assert.equal(result.NEXT_PUBLIC_SUPABASE_URL, P112_TARGET.apiOrigin);
  assert.equal(result.NEXT_PUBLIC_SUPABASE_ANON_KEY, statusSecrets.anonKey);
  assert.equal(result.SUPABASE_SERVICE_ROLE_KEY, statusSecrets.serviceRoleKey);
  assert.equal(result.NEXT_PUBLIC_ROOT_DOMAIN, '127.0.0.1:3001');
  assert.equal(result.DATABASE_URL, P112_TARGET.databaseUrl);
  assert.notEqual(result.ENCRYPTION_KEY, 'inherited-project-secret');
  assert.equal(Buffer.from(result.ENCRYPTION_KEY!, 'base64').length, 32);
  assert.equal(result.P112_ACCEPTANCE_LOCAL_ONLY, '1');
  assert.equal(result.NODE_ENV, 'production');
  assert.equal(result.NEXT_TELEMETRY_DISABLED, '1');
  assert.equal(result.TMPDIR, '/tmp/p112');
  assert.equal(result.HOME, undefined);
  assert.equal(
    result.NODE_OPTIONS,
    '--import=./scripts/p1-12-acceptance/server-egress-preload.mjs',
  );
  assert.equal(
    result.P112_EGRESS_LOG_PATH,
    '.p1-12-acceptance-runtime/egress/production-S007.jsonl',
  );
  assert.equal(result.P112_EVIDENCE_PROFILE, 'production');
  assert.equal(result.P112_EVIDENCE_STATE_ID, 'S007');
  assert.equal(result.P112_EGRESS_INITIATOR, 'app');
  assert.equal(result.WATCHPACK_POLLING, undefined);
  assert.equal(result.HTTPS_PROXY, undefined);
  assert.equal(result.HTTP_PROXY, undefined);
  assert.equal(result.ALL_PROXY, undefined);
  assert.equal(result.NO_PROXY, undefined);
  assert.equal(result.OTEL_EXPORTER_OTLP_ENDPOINT, undefined);
  assert.equal(result.SENTRY_DSN, undefined);
  assert.equal(result.VERCEL_ANALYTICS_ID, undefined);
  assert.equal(result.P112_SUPABASE_CLI_PATH, undefined);
  assert.deepEqual(Object.keys(result).sort(), [
    'DATABASE_URL',
    'ENCRYPTION_KEY',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_ROOT_DOMAIN',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_TELEMETRY_DISABLED',
    'NODE_ENV',
    'NODE_OPTIONS',
    'P112_ACCEPTANCE_LOCAL_ONLY',
    'P112_EGRESS_INITIATOR',
    'P112_EGRESS_LOG_PATH',
    'P112_EVIDENCE_PROFILE',
    'P112_EVIDENCE_STATE_ID',
    'PATH',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TMPDIR',
  ]);
});

test('creates a fresh 32-byte base64 acceptance encryption key through an injectable CSPRNG seam', () => {
  const requested: number[] = [];
  const first = createP112EphemeralEncryptionKey((size) => {
    requested.push(size);
    return Buffer.alloc(size, 0xa5);
  });
  const second = createP112EphemeralEncryptionKey((size) => {
    requested.push(size);
    return Buffer.alloc(size, 0x5a);
  });
  assert.deepEqual(requested, [32, 32]);
  assert.equal(Buffer.from(first, 'base64').length, 32);
  assert.equal(Buffer.from(second, 'base64').length, 32);
  assert.notEqual(first, second);
  assert.equal(first.includes('inherited-project-secret'), false);
});

test('uses build then production start, or an explicit development server', () => {
  assert.deepEqual(getP112AppCommands('production'), [
    { command: './node_modules/.bin/next', args: ['build', '--webpack'] },
    { command: 'npm', args: ['run', 'start', '--', '-H', '127.0.0.1'] },
  ]);
  assert.deepEqual(getP112AppCommands('production', 'start-only'), [
    { command: 'npm', args: ['run', 'start', '--', '-H', '127.0.0.1'] },
  ]);
  assert.deepEqual(getP112AppCommands('development'), [
    { command: 'npm', args: ['run', 'dev', '--', '--webpack', '-H', '127.0.0.1'] },
  ]);
});

test('disables the Next development toolbar only for acceptance development runs', () => {
  const prepare = (runAppModule as Record<string, unknown>).prepareP112DevelopmentApp;
  assert.equal(typeof prepare, 'function');
  const invoke = prepare as (mode: 'production' | 'development', distDir: string) => void;
  const productionRoot = mkdtempSync(join(tmpdir(), 'p112-production-next-'));
  const developmentRoot = mkdtempSync(join(tmpdir(), 'p112-development-next-'));

  invoke('production', productionRoot);
  invoke('development', developmentRoot);

  assert.equal(existsSync(join(productionRoot, 'cache', 'next-devtools-config.json')), false);
  assert.deepEqual(
    JSON.parse(
      readFileSync(join(developmentRoot, 'dev', 'cache', 'next-devtools-config.json'), 'utf8'),
    ),
    { disableDevIndicator: true },
  );
});

test('Webpack build reuses only the already guarded local runtime environment', () => {
  const runtime = buildP112AppEnvironment(
    {
      PATH: '/usr/bin',
      NODE_OPTIONS: '--require=remote',
      HTTPS_PROXY: 'https://remote.invalid',
      P112_EVIDENCE_STATE_ID: 'S136',
      P112_EGRESS_LOG_PATH: '.p1-12-acceptance-runtime/egress/production-S136.jsonl',
    },
    statusSecrets,
    'production',
  );
  assert.equal(
    runtime.NODE_OPTIONS,
    '--import=./scripts/p1-12-acceptance/server-egress-preload.mjs',
  );
  assert.equal(runtime.P112_ACCEPTANCE_LOCAL_ONLY, '1');
  assert.equal(runtime.NEXT_TELEMETRY_DISABLED, '1');
  assert.equal(runtime.SUPABASE_SERVICE_ROLE_KEY, statusSecrets.serviceRoleKey);
  assert.equal(runtime.DATABASE_URL, P112_TARGET.databaseUrl);
  assert.equal(runtime.HTTPS_PROXY, undefined);
  const source = readFileSync('scripts/p1-12-acceptance/run-app.ts', 'utf8');
  assert.doesNotMatch(source, /buildP112BuildEnvironment/u);
  assert.match(source, /runChild\(step\.command, step\.args, environment\)/u);
});

test('rejects an implicit or unsupported evidence mode', () => {
  assert.equal(parseP112AppMode(['--mode', 'production']), 'production');
  assert.equal(parseP112AppMode(['--mode', 'development']), 'development');
  assert.throws(() => parseP112AppMode([]), /explicit --mode/u);
  assert.throws(() => parseP112AppMode(['--mode', 'preview']), /unsupported mode/u);
});

test('accepts only frozen evidence profiles and injects their exact development variables', () => {
  assert.equal(parseP112EvidenceProfile(['--profile', 'blog-empty']), 'blog-empty');
  assert.throws(() => parseP112EvidenceProfile([]), /explicit --profile/u);
  assert.throws(() => parseP112EvidenceProfile(['--profile', 'custom']), /unsupported profile/u);
  const result = buildP112AppEnvironment(
    {
      P112_EVIDENCE_STATE_ID: 'S134',
      P112_EGRESS_LOG_PATH: '.p1-12-acceptance-runtime/egress/route-error-S134.jsonl',
    },
    statusSecrets,
    'development',
    'route-error',
  );
  assert.equal(result.P107_CMS_EVIDENCE_STATE, 'fixture');
  assert.equal(result.P112_ROUTE_ERROR_EVIDENCE_STATE, 'error');
  assert.equal(result.WATCHPACK_POLLING, 'true');
});

test('accepts only an absolute Supabase CLI binary path', () => {
  assert.equal(resolveP112SupabaseExecutable(undefined), 'supabase');
  assert.equal(resolveP112SupabaseExecutable('/opt/tools/supabase'), '/opt/tools/supabase');
  assert.throws(() => resolveP112SupabaseExecutable('npx supabase'), /path rejected/u);
  assert.throws(() => resolveP112SupabaseExecutable('/opt/tools/not-supabase'), /path rejected/u);
});
