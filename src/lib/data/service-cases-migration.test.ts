import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260811090000_0047_service_cases.sql',
);

const APPROVED_STATUS_VALUES = [
  'draft',
  'documents_pending',
  'ready_to_submit',
  'submitted',
  'authority_review',
  'approved',
  'completed',
  'cancelled',
];
const APPROVED_PRIORITY_VALUES = ['low', 'normal', 'high', 'urgent'];
const APPROVED_POLICY_NAMES = ['service_cases_platform_read', 'service_cases_pro_write'];

const normalizeSql = (sql: string) =>
  sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ',')
    .trim();

function extractServiceCasesTable(sql: string): string {
  const table = sql.match(/create table if not exists public\.service_cases\s*\(([\s\S]*?)\n\);/i);
  assert.ok(table, 'service_cases table definition is missing');
  return table[1];
}

function extractPolicyStatements(sql: string): Map<string, string> {
  const policies = [
    ...sql.matchAll(/create\s+policy\s+([a-z0-9_]+)\s+on\s+public\.service_cases\b[\s\S]*?;/gi),
  ].map((match) => [match[1], match[0]] as const);

  assert.equal(
    policies.length,
    APPROVED_POLICY_NAMES.length,
    'service_cases must have exactly the approved policy count',
  );
  assert.deepEqual(
    policies.map(([name]) => name).sort(),
    [...APPROVED_POLICY_NAMES].sort(),
    'service_cases policy names must be exactly the approved set',
  );

  return new Map(policies);
}

function extractClause(policy: string, clause: string): string {
  const clauseStart = new RegExp(`\\b${clause}\\s*\\(`, 'i').exec(policy);
  assert.ok(clauseStart, `${clause} clause is missing`);

  const openParen = clauseStart.index + clauseStart[0].lastIndexOf('(');
  let depth = 0;
  for (let index = openParen; index < policy.length; index += 1) {
    if (policy[index] === '(') depth += 1;
    if (policy[index] !== ')') continue;
    depth -= 1;
    if (depth === 0) return normalizeSql(policy.slice(openParen + 1, index));
  }

  assert.fail(`${clause} clause is not balanced`);
}

function extractCheckValues(table: string, column: string): string[] {
  const check = new RegExp(
    `\\b${column}\\s+text\\s+not\\s+null(?:\\s+default\\s+'[^']+')?\\s+check\\s*\\(\\s*${column}\\s+in\\s*\\(([^)]*)\\)\\s*\\)`,
    'i',
  ).exec(table);
  assert.ok(check, `${column} status check is missing or unbounded`);
  return [...check[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function assertMutationRejected(
  sql: string,
  mutate: (source: string) => string,
  failure: RegExp,
): void {
  const weakened = mutate(sql);
  assert.notEqual(weakened, sql, 'schema mutation must change only the in-memory SQL');
  assert.throws(() => assertServiceCasesMigrationContract(weakened), failure);
}

function assertServiceCasesMigrationContract(sql: string): void {
  const table = extractServiceCasesTable(sql);

  assert.match(sql, /create table if not exists public\.service_cases\s*\(/i);

  assert.match(
    table,
    /id uuid primary key default gen_random_uuid\(\)/i,
    'service_cases id must be a generated UUID primary key',
  );
  assert.match(
    table,
    /tenant_id uuid not null references public\.tenants\(id\) on delete cascade/i,
  );
  assert.match(table, /client_id uuid not null\b/i);
  assert.match(
    table,
    /title text not null check \(char_length\(trim\(title\)\) between 2 and 160\)/i,
  );
  assert.match(
    table,
    /service_type text not null check \(char_length\(trim\(service_type\)\) between 2 and 80\)/i,
  );
  assert.match(
    table,
    /blocked_reason text check \(blocked_reason is null or char_length\(trim\(blocked_reason\)\) between 2 and 500\)/i,
  );
  assert.match(table, /\bdue_at timestamptz\b/i, 'due_at must be a timestamptz column');
  assert.match(table, /\bsla_due_at timestamptz\b/i, 'sla_due_at must be a timestamptz column');
  assert.match(table, /\bcompleted_at timestamptz\b/i, 'completed_at must be a timestamptz column');
  assert.match(table, /created_at timestamptz not null default now\(\)/i);
  assert.match(table, /updated_at timestamptz not null default now\(\)/i);
  assert.match(
    table,
    /foreign key\s*\(tenant_id\s*,\s*client_id\)\s*references public\.clients\s*\(tenant_id\s*,\s*id\)\s*on delete cascade/i,
  );
  assert.match(table, /assigned_to uuid references public\.profiles\(id\) on delete set null/i);
  assert.match(table, /created_by uuid references public\.profiles\(id\) on delete set null/i);
  assert.match(
    table,
    /foreign key\s*\(tenant_id\s*,\s*assigned_to\)\s*references public\.profiles\s*\(tenant_id\s*,\s*id\)\s*on delete set null\s*\(assigned_to\)/i,
  );
  assert.match(
    table,
    /foreign key\s*\(tenant_id\s*,\s*created_by\)\s*references public\.profiles\s*\(tenant_id\s*,\s*id\)\s*on delete set null\s*\(created_by\)/i,
  );

  assert.deepEqual(
    extractCheckValues(table, 'status'),
    APPROVED_STATUS_VALUES,
    'service_cases status check values must be exactly the approved eight values',
  );
  assert.deepEqual(
    extractCheckValues(table, 'priority'),
    APPROVED_PRIORITY_VALUES,
    'service_cases priority check values must be exactly the approved four values',
  );

  assert.match(
    sql,
    /check\s*\(\(status\s*=\s*'completed'\)\s*=\s*\(completed_at\s+is\s+not\s+null\)\)/i,
  );

  assert.match(
    sql,
    /service_cases_tenant_status_idx[\s\S]*tenant_id\s*,\s*status\s*,\s*created_at\s+desc/i,
  );
  assert.match(
    sql,
    /service_cases_tenant_client_status_idx[\s\S]*tenant_id\s*,\s*client_id\s*,\s*status\s*,\s*created_at\s+desc/i,
  );
  assert.match(sql, /service_cases_assignee_idx[\s\S]*tenant_id\s*,\s*assigned_to\s*,\s*status/i);
  assert.match(sql, /service_cases_creator_idx[\s\S]*tenant_id\s*,\s*created_by/i);
  assert.match(sql, /service_cases_tenant_sla_idx[\s\S]*tenant_id\s*,\s*sla_due_at/i);
  assert.match(
    sql,
    /where\s+sla_due_at\s+is\s+not\s+null\s+and\s+status\s+not\s+in\s*\('completed'\s*,\s*'cancelled'\)/i,
  );
  assert.match(
    sql,
    /create unique index if not exists clients_tenant_id_id_key\s+on public\.clients\s*\(\s*tenant_id\s*,\s*id\s*\)\s*;/i,
    'clients replay-safe parent index must be unique on tenant_id,id',
  );
  assert.match(
    sql,
    /create unique index if not exists profiles_tenant_id_id_key\s+on public\.profiles\s*\(\s*tenant_id\s*,\s*id\s*\)\s*;/i,
    'profiles replay-safe parent index must be unique on tenant_id,id',
  );

  assert.match(sql, /create trigger service_cases_set_updated_at/i);
  assert.match(sql, /execute function public\.set_updated_at\(\)/i);
  assert.match(sql, /alter table public\.service_cases enable row level security/i);

  const policies = extractPolicyStatements(sql);
  const platformPolicy = policies.get('service_cases_platform_read');
  const proPolicy = policies.get('service_cases_pro_write');
  assert.ok(platformPolicy);
  assert.ok(proPolicy);

  assert.equal(
    normalizeSql(platformPolicy),
    "create policy service_cases_platform_read on public.service_cases for select using ((auth.jwt() -> 'app_metadata' ->> 'mandoob_role') in ('super_admin','admin'));",
    'platform policy body must remain bound to platform roles',
  );

  const expectedProTenantBinding = normalizeSql(
    "tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid and (auth.jwt() -> 'app_metadata' ->> 'mandoob_role') = 'pro'",
  );
  assert.equal(
    normalizeSql(proPolicy).startsWith(
      'create policy service_cases_pro_write on public.service_cases for all',
    ),
    true,
  );
  assert.equal(
    extractClause(proPolicy, 'using'),
    expectedProTenantBinding,
    'PRO USING must require exact JWT tenant equality and mandoob_role=pro',
  );
  assert.equal(
    extractClause(proPolicy, 'with check'),
    expectedProTenantBinding,
    'PRO WITH CHECK must require exact JWT tenant equality and mandoob_role=pro',
  );
  assert.equal(
    normalizeSql(proPolicy),
    `create policy service_cases_pro_write on public.service_cases for all using (${expectedProTenantBinding}) with check (${expectedProTenantBinding});`,
    'PRO policy body must be exactly tenant-bound for reads and writes',
  );
}

function readMigration(): string {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  return readFileSync(migrationPath, 'utf8');
}

test('service cases migration defines the tenant-scoped case contract', () => {
  assertServiceCasesMigrationContract(readMigration());
});

test('service cases migration contract rejects weakened in-memory variants', () => {
  const sql = readMigration();

  assertMutationRejected(
    sql,
    (source) =>
      source.replace(/create policy service_cases_pro_write[\s\S]*?;/i, (policy) =>
        policy.replace(/tenant_id\s*=\s*\(\(auth\.jwt\(\)[\s\S]*?\)::uuid/gi, 'true'),
      ),
    /PRO USING must require exact JWT tenant equality/,
  );

  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /(status text not null default 'draft' check \(status in \([\s\S]*?)'cancelled'/i,
        '$1',
      ),
    /status check values must be exactly the approved eight values/,
  );

  assertMutationRejected(
    sql,
    (source) =>
      source.replace(/id uuid primary key default gen_random_uuid\(\)/i, 'id uuid primary key'),
    /service_cases id must be a generated UUID primary key/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/\bdue_at timestamptz/i, 'due_at text'),
    /due_at must be a timestamptz column/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/\bsla_due_at timestamptz/i, 'sla_due_at text'),
    /sla_due_at must be a timestamptz column/,
  );
  assertMutationRejected(
    sql,
    (source) => source.replace(/\bcompleted_at timestamptz/i, 'completed_at text'),
    /completed_at must be a timestamptz column/,
  );
  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /create unique index if not exists clients_tenant_id_id_key[\s\S]*?;/i,
        'create index if not exists clients_tenant_id_id_key on public.clients(tenant_id);',
      ),
    /clients replay-safe parent index must be unique on tenant_id,id/,
  );
  assertMutationRejected(
    sql,
    (source) =>
      source.replace(
        /create unique index if not exists profiles_tenant_id_id_key[\s\S]*?;/i,
        'create index if not exists profiles_tenant_id_id_key on public.profiles(tenant_id);',
      ),
    /profiles replay-safe parent index must be unique on tenant_id,id/,
  );
  assert.equal(readMigration(), sql, 'in-memory mutations must not modify the migration on disk');
});
