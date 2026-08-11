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
  assert.match(sql, /client_id uuid not null references public\.clients\(id\) on delete cascade/i);
  assert.match(sql, /assigned_to uuid references public\.profiles\(id\) on delete set null/i);
  assert.match(sql, /created_by uuid references public\.profiles\(id\) on delete set null/i);

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
    /check\s*\(\(status\s*=\s*'completed'\s+and\s+completed_at\s+is\s+not\s+null\)\s+or\s+status\s*<>\s*'completed'\)/i,
  );

  assert.match(sql, /service_cases_tenant_status_idx[\s\S]*tenant_id\s*,\s*status\s*,\s*created_at\s+desc/i);
  assert.match(sql, /service_cases_tenant_sla_idx[\s\S]*tenant_id\s*,\s*sla_due_at/i);
  assert.match(sql, /service_cases_assignee_idx[\s\S]*tenant_id\s*,\s*assigned_to\s*,\s*status/i);
  assert.match(sql, /where\s+status\s+not\s+in\s*\('completed'\s*,\s*'cancelled'\)/i);

  assert.match(sql, /create trigger service_cases_set_updated_at/i);
  assert.match(sql, /execute function public\.set_updated_at\(\)/i);
  assert.match(sql, /alter table public\.service_cases enable row level security/i);

  assert.match(sql, /create policy service_cases_super_admin_read[\s\S]*for select[\s\S]*app_metadata[\s\S]*'super_admin'/i);
  assert.match(sql, /create policy service_cases_tenant_read[\s\S]*for select[\s\S]*tenant_id[\s\S]*app_metadata[\s\S]*tenant_id/i);
  assert.match(
    sql,
    /create policy service_cases_pro_write[\s\S]*for all[\s\S]*using\s*\([\s\S]*tenant_id[\s\S]*app_metadata[\s\S]*tenant_id[\s\S]*\)[\s\S]*with check\s*\([\s\S]*tenant_id[\s\S]*app_metadata[\s\S]*tenant_id[\s\S]*\)[\s\S]*in\s*\('pro'\s*,\s*'admin'\)/i,
  );
});
