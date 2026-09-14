import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { P112_TARGET } from './contract';

type GuardModule = {
  assertP112Target(input: unknown): { serviceRoleKey: string; anonKey: string };
  renderP112Config(source: string): string;
  assertP112Config(config: string): void;
};

async function loadGuard(): Promise<Partial<GuardModule>> {
  return import('./guard-config').catch(() => ({}));
}

const status = JSON.stringify({
  API_URL: P112_TARGET.apiOrigin,
  DB_URL: P112_TARGET.databaseUrl,
  FUNCTIONS_URL: `${P112_TARGET.apiOrigin}/functions/v1`,
  GRAPHQL_URL: `${P112_TARGET.apiOrigin}/graphql/v1`,
  STUDIO_URL: P112_TARGET.studioOrigin,
  INBUCKET_URL: P112_TARGET.inbucketOrigin,
  MAILPIT_URL: P112_TARGET.inbucketOrigin,
  MCP_URL: `${P112_TARGET.apiOrigin}/mcp`,
  REST_URL: `${P112_TARGET.apiOrigin}/rest/v1`,
  ANON_KEY: 'local-anon-secret',
  JWT_SECRET: 'local-jwt-secret',
  PUBLISHABLE_KEY: 'local-publishable-secret',
  S3_PROTOCOL_ACCESS_KEY_ID: 'local-storage-access-secret',
  S3_PROTOCOL_ACCESS_KEY_SECRET: 'local-storage-secret',
  SECRET_KEY: 'local-secret-key',
  SERVICE_ROLE_KEY: 'local-service-secret',
  STORAGE_S3_URL: `${P112_TARGET.apiOrigin}/storage/v1/s3`,
  S3_PROTOCOL_REGION: 'local',
});

const inspect = [
  {
    Name: `/${P112_TARGET.databaseContainer}`,
    Config: { Labels: { 'com.supabase.cli.project': P112_TARGET.projectId } },
    NetworkSettings: {
      Ports: {
        '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '56322' }],
      },
    },
  },
  ...[
    ['kong', '8000/tcp', '56321'],
    ['studio', '3000/tcp', '56323'],
    ['inbucket', '8025/tcp', '56324'],
    ['analytics', '4000/tcp', '56327'],
  ].map(([service, containerPort, hostPort]) => ({
    Name: `/supabase_${service}_${P112_TARGET.projectId}`,
    Config: { Labels: { 'com.supabase.cli.project': P112_TARGET.projectId } },
    NetworkSettings: {
      Ports: {
        [containerPort]: [{ HostIp: '127.0.0.1', HostPort: hostPort }],
      },
    },
  })),
];

const network = [
  {
    Name: P112_TARGET.networkName,
    Labels: { 'com.supabase.cli.project': P112_TARGET.projectId },
    Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' },
  },
];

test('guard accepts only explicit opt-in, exact status, and exact container identity', async () => {
  const guard = await loadGuard();
  assert.equal(typeof guard.assertP112Target, 'function');
  const result = guard.assertP112Target?.({
    env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
    status,
    inspect,
    network,
  });
  assert.deepEqual(result, {
    anonKey: 'local-anon-secret',
    serviceRoleKey: 'local-service-secret',
  });
});

test('guard rejects remote, ambiguous, missing, and mismatched targets before secrets escape', async () => {
  const guard = await loadGuard();
  assert.equal(typeof guard.assertP112Target, 'function');
  const cases = [
    { env: {}, status, inspect, network },
    { env: { P112_ACCEPTANCE_LOCAL_ONLY: 'yes' }, status, inspect, network },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status: status.replace('127.0.0.1:56321', 'project.supabase.co'),
      inspect,
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status: status.replace(
        `"GRAPHQL_URL":"${P112_TARGET.apiOrigin}/graphql/v1"`,
        '"GRAPHQL_URL":"https://project.supabase.co/graphql/v1"',
      ),
      inspect,
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status: JSON.stringify({ ...JSON.parse(status), GRAPHQL_URL: undefined }),
      inspect,
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status: status.replace(
        'http://127.0.0.1:56321/storage/v1/s3',
        'https://storage.example.com/storage/v1/s3',
      ),
      inspect,
      network,
    },
    { env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' }, status: '{}', inspect, network },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status,
      inspect: inspect.map((item, index) =>
        index === 0
          ? {
              ...item,
              Config: { Labels: { 'com.supabase.cli.project': 'mandoob' } },
            }
          : item,
      ),
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status,
      inspect: inspect.map((item, index) =>
        index === 0
          ? {
              ...item,
              NetworkSettings: {
                Ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '56322' }] },
              },
            }
          : item,
      ),
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status,
      inspect: inspect.map((item, index) =>
        index === 1
          ? {
              ...item,
              NetworkSettings: {
                Ports: { '8000/tcp': [{ HostIp: '0.0.0.0', HostPort: '56322' }] },
              },
            }
          : item,
      ),
      network,
    },
    {
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status,
      inspect,
      network: [{ ...network[0], Options: {} }],
    },
  ];
  for (const input of cases) assert.throws(() => guard.assertP112Target?.(input));
});

test('guard accepts only the actual sanitized CLI status storage key shape', async () => {
  const guard = await loadGuard();
  const actualStatusKeys = [
    'ANON_KEY',
    'API_URL',
    'DB_URL',
    'FUNCTIONS_URL',
    'GRAPHQL_URL',
    'INBUCKET_URL',
    'JWT_SECRET',
    'MAILPIT_URL',
    'MCP_URL',
    'PUBLISHABLE_KEY',
    'REST_URL',
    'S3_PROTOCOL_ACCESS_KEY_ID',
    'S3_PROTOCOL_ACCESS_KEY_SECRET',
    'S3_PROTOCOL_REGION',
    'SECRET_KEY',
    'SERVICE_ROLE_KEY',
    'STORAGE_S3_URL',
    'STUDIO_URL',
  ];
  assert.deepEqual(Object.keys(JSON.parse(status)).sort(), actualStatusKeys);
  const guardSource = readFileSync('scripts/p1-12-acceptance/guard-config.ts', 'utf8');
  assert.doesNotMatch(
    guardSource,
    /S3_PROTOCOL_ACCESS_KEY_(?:ID|SECRET)|JWT_SECRET|PUBLISHABLE_KEY|(?<!SERVICE_ROLE_)SECRET_KEY/u,
  );
  assert.doesNotThrow(() =>
    guard.assertP112Target?.({
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status,
      inspect,
      network,
    }),
  );
  for (const wrongStorage of [
    { STORAGE_S3_URL: `${P112_TARGET.apiOrigin}/storage/v1`, S3_PROTOCOL_REGION: 'local' },
    { STORAGE_S3_URL: `${P112_TARGET.apiOrigin}/storage/v1/s3`, S3_PROTOCOL_REGION: 'us-east-1' },
    { S3_STORAGE_URL: `${P112_TARGET.apiOrigin}/storage/v1/s3`, S3_PROTOCOL_REGION: 'local' },
    { S3_PROTOCOL: 'http', S3_HOST: '127.0.0.1', S3_PORT: '56321' },
  ]) {
    assert.throws(() =>
      guard.assertP112Target?.({
        env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
        status: JSON.stringify({
          ...JSON.parse(status),
          STORAGE_S3_URL: undefined,
          S3_PROTOCOL_REGION: undefined,
          ...wrongStorage,
        }),
        inspect,
        network,
      }),
    );
  }
});

test('guard requires exact REST, MCP, Mailpit, and Functions URLs and rejects unknown URL fields', async () => {
  const guard = await loadGuard();
  const parsed = JSON.parse(status) as Record<string, string>;
  for (const [key, mismatch] of [
    ['REST_URL', `${P112_TARGET.apiOrigin}/rest/v2`],
    ['MCP_URL', `${P112_TARGET.apiOrigin}/mcp/v1`],
    ['MAILPIT_URL', 'http://127.0.0.1:56325'],
    ['FUNCTIONS_URL', `${P112_TARGET.apiOrigin}/functions/v2`],
  ] as const) {
    for (const changed of [
      { ...parsed, [key]: undefined },
      { ...parsed, [key]: `https://remote.example/${key.toLowerCase()}` },
      { ...parsed, [key]: mismatch },
    ]) {
      assert.throws(() =>
        guard.assertP112Target?.({
          env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
          status: JSON.stringify(changed),
          inspect,
          network,
        }),
      );
    }
  }
  assert.throws(() =>
    guard.assertP112Target?.({
      env: { P112_ACCEPTANCE_LOCAL_ONLY: '1' },
      status: JSON.stringify({ ...parsed, UNEXPECTED_URL: P112_TARGET.apiOrigin }),
      inspect,
      network,
    }),
  );
});

test('temporary config has exact isolated ports, origin, project ID, and TOTP-only MFA', async () => {
  const guard = await loadGuard();
  assert.equal(typeof guard.renderP112Config, 'function');
  assert.equal(typeof guard.assertP112Config, 'function');
  const source = [
    'project_id = "mandoob"',
    '[api]',
    'port = 54321',
    '[db]',
    'port = 54322',
    'shadow_port = 54320',
    '[db.pooler]',
    'enabled = false',
    'port = 54329',
    '[studio]',
    'port = 54323',
    '[inbucket]',
    'port = 54324',
    '[storage]',
    'enabled = true',
    '[storage.s3_protocol]',
    'enabled = true',
    '[storage.analytics]',
    'enabled = true',
    '[storage.vector]',
    'enabled = true',
    '[auth]',
    'site_url = "http://127.0.0.1:3001"',
    'additional_redirect_urls = ["https://127.0.0.1:3001"]',
    '[auth.mfa.totp]',
    'enroll_enabled = false',
    'verify_enabled = false',
    '[auth.mfa.phone]',
    'enroll_enabled = false',
    'verify_enabled = false',
    '[edge_runtime]',
    'inspector_port = 8083',
    '[analytics]',
    'port = 54327',
    '[experimental]',
    'orioledb_version = ""',
  ].join('\n');
  const rendered = guard.renderP112Config?.(source) ?? '';
  assert.doesNotThrow(() => guard.assertP112Config?.(rendered));
  assert.match(rendered, /project_id = "mandoob-p1-12-acceptance"/u);
  assert.match(rendered, /additional_redirect_urls = \["http:\/\/127\.0\.0\.1:3001"\]/u);
  assert.match(rendered, /\[auth\.mfa\.totp\]\nenroll_enabled = true\nverify_enabled = true/u);
  assert.match(rendered, /\[auth\.mfa\.phone\]\nenroll_enabled = false\nverify_enabled = false/u);
  assert.match(rendered, /\[storage\]\nenabled = true/u);
  assert.match(rendered, /\[storage\.s3_protocol\]\nenabled = true/u);
  assert.match(rendered, /\[storage\.analytics\]\nenabled = false/u);
  assert.match(rendered, /\[storage\.vector\]\nenabled = false/u);
  assert.match(rendered, /\[experimental\][\s\S]*orioledb_version = ""/u);
});

test('config validation rejects a single changed target value', async () => {
  const guard = await loadGuard();
  assert.equal(typeof guard.renderP112Config, 'function');
  assert.equal(typeof guard.assertP112Config, 'function');
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync('supabase/config.toml', 'utf8'),
  );
  const rendered = guard.renderP112Config?.(source) ?? '';
  assert.throws(() => guard.assertP112Config?.(rendered.replace('56321', '54321')));
});
