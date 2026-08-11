import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20260811090000_0047_service_cases.sql',
);

test('service cases migration defines the tenant-scoped case contract', () => {
  assert.ok(existsSync(migrationPath), `missing migration: ${migrationPath}`);
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create table if not exists public\.service_cases\s*\(/i);
  assert.match(sql, /tenant_id uuid not null references public\.tenants\(id\) on delete cascade/i);
  assert.match(sql, /foreign key\s*\(tenant_id\s*,\s*client_id\)\s*references public\.clients\s*\(tenant_id\s*,\s*id\)\s*on delete cascade/i);
  assert.match(sql, /create unique index if not exists clients_tenant_id_id_key[\s\S]*on public\.clients\s*\(tenant_id\s*,\s*id\)/i);
  assert.match(sql, /create unique index if not exists profiles_tenant_id_id_key[\s\S]*on public\.profiles\s*\(tenant_id\s*,\s*id\)/i);
  assert.match(sql, /assigned_to uuid references public\.profiles\(id\) on delete set null/i);
  assert.match(sql, /created_by uuid references public\.profiles\(id\) on delete set null/i);
  assert.match(sql, /foreign key\s*\(tenant_id\s*,\s*assigned_to\)\s*references public\.profiles\s*\(tenant_id\s*,\s*id\)\s*on delete set null\s*\(assigned_to\)/i);
  assert.match(sql, /foreign key\s*\(tenant_id\s*,\s*created_by\)\s*references public\.profiles\s*\(tenant_id\s*,\s*id\)\s*on delete set null\s*\(created_by\)/i);

  for (const status of [
    'draft',
    'documents_pending',
    'ready_to_submit',
    'submitted',
    'authority_review',
    'approved',
    'completed',
    'cancelled',
  ]) {
    assert.match(sql, new RegExp(`'${status}'`));
  }
  for (const priority of ['low', 'normal', 'high', 'urgent']) {
    assert.match(sql, new RegExp(`'${priority}'`));
  }

  assert.match(
    sql,
    /check\s*\(\(status\s*=\s*'completed'\)\s*=\s*\(completed_at\s+is\s+not\s+null\)\)/i,
  );

  assert.match(sql, /service_cases_tenant_status_idx[\s\S]*tenant_id\s*,\s*status\s*,\s*created_at\s+desc/i);
  assert.match(sql, /service_cases_tenant_client_status_idx[\s\S]*tenant_id\s*,\s*client_id\s*,\s*status\s*,\s*created_at\s+desc/i);
  assert.match(sql, /service_cases_assignee_idx[\s\S]*tenant_id\s*,\s*assigned_to\s*,\s*status/i);
  assert.match(sql, /service_cases_creator_idx[\s\S]*tenant_id\s*,\s*created_by/i);
  assert.match(sql, /service_cases_tenant_sla_idx[\s\S]*tenant_id\s*,\s*sla_due_at/i);
  assert.match(sql, /where\s+sla_due_at\s+is\s+not\s+null\s+and\s+status\s+not\s+in\s*\('completed'\s*,\s*'cancelled'\)/i);

  assert.match(sql, /create trigger service_cases_set_updated_at/i);
  assert.match(sql, /execute function public\.set_updated_at\(\)/i);
  assert.match(sql, /alter table public\.service_cases enable row level security/i);

  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'mandoob_role'/i);
  assert.doesNotMatch(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'/i);
  assert.match(
    sql,
    /create policy service_cases_platform_read[\s\S]*for select[\s\S]*mandoob_role[\s\S]*in\s*\(\s*'super_admin'\s*,\s*'admin'\s*\)/i,
  );
  assert.doesNotMatch(sql, /create policy\s+service_cases_tenant_read/i);
  assert.doesNotMatch(sql, /create policy[\s\S]*service_cases[\s\S]*(customer|employee)/i);
  assert.match(
    sql,
    /create policy service_cases_pro_write[\s\S]*for all[\s\S]*using\s*\([\s\S]*tenant_id[\s\S]*mandoob_role[\s\S]*=\s*'pro'[\s\S]*\)[\s\S]*with check\s*\([\s\S]*tenant_id[\s\S]*mandoob_role[\s\S]*=\s*'pro'[\s\S]*\)/i,
  );
  assert.doesNotMatch(
    sql,
    /create policy service_cases_pro_write[\s\S]*mandoob_role[\s\S]*in\s*\([\s\S]*'admin'/i,
  );
});
