import { P112_TARGET } from './contract';

type StatusSecrets = { serviceRoleKey: string; anonKey: string };
type GuardInput = {
  env: Record<string, string | undefined>;
  status: string | Record<string, unknown>;
  inspect: unknown;
  network: unknown;
};

type DockerNetworkInspect = {
  Name?: unknown;
  Labels?: Record<string, unknown> | null;
  Options?: Record<string, unknown> | null;
};

type DockerInspect = {
  Name?: unknown;
  Config?: { Labels?: Record<string, unknown> | null } | null;
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: unknown; HostPort?: unknown }> | null> | null;
  } | null;
};

function fail(message: string): never {
  throw new Error(`P1.12 local target rejected: ${message}`);
}

function parseStatus(value: GuardInput['status']): Record<string, unknown> {
  if (typeof value !== 'string') return value;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('invalid status');
    return parsed as Record<string, unknown>;
  } catch {
    return fail('unreadable status');
  }
}

function exactString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) fail(`missing ${key}`);
  return value;
}

function assertLoopbackUrl(actual: string, expected: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(actual);
  } catch {
    return fail(`invalid ${label}`);
  }
  if (parsed.hostname !== '127.0.0.1' || actual !== expected) fail(`${label} mismatch`);
}

export function assertP112Target(input: GuardInput): StatusSecrets {
  if (input.env.P112_ACCEPTANCE_LOCAL_ONLY !== '1') fail('explicit opt-in missing');

  if (!Array.isArray(input.network) || input.network.length !== 1) {
    fail('isolated network missing');
  }
  const network = input.network[0] as DockerNetworkInspect;
  if (
    network.Name !== P112_TARGET.networkName ||
    network.Labels?.['com.supabase.cli.project'] !== P112_TARGET.projectId ||
    network.Options?.['com.docker.network.bridge.host_binding_ipv4'] !== '127.0.0.1'
  ) {
    fail('isolated network mismatch');
  }

  const status = parseStatus(input.status);
  const permittedUrlKeys = new Set([
    'API_URL',
    'DB_URL',
    'FUNCTIONS_URL',
    'GRAPHQL_URL',
    'INBUCKET_URL',
    'MAILPIT_URL',
    'MCP_URL',
    'REST_URL',
    'STORAGE_S3_URL',
    'STUDIO_URL',
  ]);
  for (const key of Object.keys(status)) {
    if (key.endsWith('_URL') && !permittedUrlKeys.has(key)) fail('unexpected status URL field');
  }
  assertLoopbackUrl(exactString(status, 'API_URL'), P112_TARGET.apiOrigin, 'API_URL');
  assertLoopbackUrl(
    exactString(status, 'FUNCTIONS_URL'),
    `${P112_TARGET.apiOrigin}/functions/v1`,
    'FUNCTIONS_URL',
  );
  assertLoopbackUrl(
    exactString(status, 'GRAPHQL_URL'),
    `${P112_TARGET.apiOrigin}/graphql/v1`,
    'GRAPHQL_URL',
  );
  assertLoopbackUrl(exactString(status, 'DB_URL'), P112_TARGET.databaseUrl, 'DB_URL');
  assertLoopbackUrl(exactString(status, 'STUDIO_URL'), P112_TARGET.studioOrigin, 'STUDIO_URL');
  assertLoopbackUrl(
    exactString(status, 'INBUCKET_URL'),
    P112_TARGET.inbucketOrigin,
    'INBUCKET_URL',
  );
  assertLoopbackUrl(exactString(status, 'MAILPIT_URL'), P112_TARGET.inbucketOrigin, 'MAILPIT_URL');
  assertLoopbackUrl(exactString(status, 'MCP_URL'), `${P112_TARGET.apiOrigin}/mcp`, 'MCP_URL');
  assertLoopbackUrl(
    exactString(status, 'REST_URL'),
    `${P112_TARGET.apiOrigin}/rest/v1`,
    'REST_URL',
  );
  for (const rejectedKey of ['S3_STORAGE_URL', 'S3_PROTOCOL', 'S3_HOST', 'S3_PORT']) {
    if (rejectedKey in status) fail('unexpected storage endpoint shape');
  }
  assertLoopbackUrl(
    exactString(status, 'STORAGE_S3_URL'),
    `${P112_TARGET.apiOrigin}/storage/v1/s3`,
    'STORAGE_S3_URL',
  );
  if (exactString(status, 'S3_PROTOCOL_REGION') !== 'local') {
    fail('storage protocol region mismatch');
  }

  if (!Array.isArray(input.inspect) || input.inspect.length === 0)
    fail('missing container inspect');
  const requiredMappings = new Map<string, readonly [string, string]>([
    [`supabase_kong_${P112_TARGET.projectId}`, ['8000/tcp', '56321']],
    [P112_TARGET.databaseContainer, ['5432/tcp', '56322']],
    [`supabase_studio_${P112_TARGET.projectId}`, ['3000/tcp', '56323']],
    [`supabase_inbucket_${P112_TARGET.projectId}`, ['8025/tcp', '56324']],
    [`supabase_analytics_${P112_TARGET.projectId}`, ['4000/tcp', '56327']],
  ]);
  const foundMappings = new Set<string>();
  for (const raw of input.inspect as DockerInspect[]) {
    const name = typeof raw.Name === 'string' ? raw.Name.replace(/^\//u, '') : '';
    const project = raw.Config?.Labels?.['com.supabase.cli.project'];
    if (!name.endsWith(`_${P112_TARGET.projectId}`) || project !== P112_TARGET.projectId) {
      fail('container identity mismatch');
    }
    for (const [containerPort, bindings] of Object.entries(raw.NetworkSettings?.Ports ?? {})) {
      if (!bindings?.length) continue;
      const expected = requiredMappings.get(name);
      if (!expected || expected[0] !== containerPort || foundMappings.has(name)) {
        fail('unexpected published container mapping');
      }
      if (bindings.length !== 1) fail('container binding set mismatch');
      for (const binding of bindings ?? []) {
        if (binding.HostIp !== '127.0.0.1') {
          fail('unexpected container binding address');
        }
        if (binding.HostPort !== expected[1]) fail('container port mapping mismatch');
      }
      foundMappings.add(name);
    }
  }
  for (const name of requiredMappings.keys()) {
    if (!foundMappings.has(name)) fail(`container mapping missing: ${name}`);
  }

  return {
    anonKey: exactString(status, 'ANON_KEY'),
    serviceRoleKey: exactString(status, 'SERVICE_ROLE_KEY'),
  };
}

function transformToml(
  source: string,
  changes: ReadonlyMap<string, ReadonlyMap<string, string>>,
): string {
  let section = '';
  const seen = new Set<string>();
  const lines = source.split(/\r?\n/u).map((line) => {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/u);
    if (sectionMatch) {
      section = sectionMatch[1];
      return line;
    }
    const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*=/u);
    if (!keyMatch) return line;
    const replacement = changes.get(section)?.get(keyMatch[1]);
    if (replacement === undefined) return line;
    seen.add(`${section}:${keyMatch[1]}`);
    return `${keyMatch[1]} = ${replacement}`;
  });
  for (const [targetSection, values] of changes) {
    for (const key of values.keys()) {
      if (!seen.has(`${targetSection}:${key}`))
        fail(`config key [${targetSection}] ${key} missing`);
    }
  }
  return lines.join('\n');
}

const CONFIG_CHANGES = new Map([
  ['', new Map([['project_id', `"${P112_TARGET.projectId}"`]])],
  ['api', new Map([['port', '56321']])],
  [
    'db',
    new Map([
      ['port', '56322'],
      ['shadow_port', '56320'],
    ]),
  ],
  [
    'db.pooler',
    new Map([
      ['enabled', 'false'],
      ['port', '56329'],
    ]),
  ],
  ['studio', new Map([['port', '56323']])],
  ['inbucket', new Map([['port', '56324']])],
  ['storage', new Map([['enabled', 'true']])],
  ['storage.s3_protocol', new Map([['enabled', 'true']])],
  ['storage.analytics', new Map([['enabled', 'false']])],
  ['storage.vector', new Map([['enabled', 'false']])],
  [
    'auth',
    new Map([
      ['site_url', `"${P112_TARGET.appOrigin}"`],
      ['additional_redirect_urls', `["${P112_TARGET.appOrigin}"]`],
    ]),
  ],
  [
    'auth.mfa.totp',
    new Map([
      ['enroll_enabled', 'true'],
      ['verify_enabled', 'true'],
    ]),
  ],
  [
    'auth.mfa.phone',
    new Map([
      ['enroll_enabled', 'false'],
      ['verify_enabled', 'false'],
    ]),
  ],
  ['edge_runtime', new Map([['inspector_port', '56383']])],
  ['analytics', new Map([['port', '56327']])],
  ['experimental', new Map([['orioledb_version', '""']])],
]);

export function renderP112Config(source: string): string {
  const rendered = transformToml(source, CONFIG_CHANGES);
  assertP112Config(rendered);
  return rendered;
}

function readTomlValues(source: string): Map<string, string> {
  let section = '';
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/u)) {
    const sectionMatch = line.match(/^\s*\[([^\]]+)\]\s*$/u);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }
    const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+)\s*=\s*(.*?)\s*$/u);
    if (keyMatch) values.set(`${section}:${keyMatch[1]}`, keyMatch[2]);
  }
  return values;
}

export function assertP112Config(config: string): void {
  const values = readTomlValues(config);
  for (const [section, expected] of CONFIG_CHANGES) {
    for (const [key, value] of expected) {
      if (values.get(`${section}:${key}`) !== value) fail(`config mismatch [${section}] ${key}`);
    }
  }
}
