import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20261027020000_0114_p3_10_operational_runtime.sql',
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return (await readFile(migrationUrl, 'utf8')).toLowerCase();
}

const runtimeTables = [
  'operational_notifications',
  'operational_tasks',
  'operational_activity',
  'message_template_versions',
  'company_message_template_overrides',
  'runtime_delivery_preferences',
  'runtime_delivery_receipts',
  'operational_runtime_audit',
];

test('persists company-scoped operational projections with stable cursor indexes', async () => {
  const sql = await migrationSql();

  for (const table of runtimeTables) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(sql, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`),
    );
  }

  for (const table of ['operational_notifications', 'operational_tasks', 'operational_activity']) {
    assert.match(sql, new RegExp(`${table}[\\s\\S]*tenant_id uuid not null`));
    assert.match(sql, new RegExp(`${table}[\\s\\S]*company_id uuid not null`));
    assert.match(
      sql,
      new RegExp(
        `create index ${table}_cursor_idx[\\s\\S]*\\(tenant_id, company_id, created_at desc, id desc\\)`,
      ),
    );
    assert.match(
      sql,
      new RegExp(
        `${table}[\\s\\S]*foreign key \\(tenant_id, company_id\\)[\\s\\S]*references public\\.company_profiles \\(tenant_id, id\\)`,
      ),
    );
    assert.match(sql, new RegExp(`${table}[\\s\\S]*source_event_id uuid not null`));
  }

  assert.match(sql, /operational_notifications[\s\S]*read_at timestamptz/);
  assert.match(sql, /unique \(source_event_id, projection_key\)/);
});

test('keeps templates versioned and resolves disabled-by-default channel policy at delivery time', async () => {
  const sql = await migrationSql();

  assert.match(sql, /primary key \(template_key, version, channel\)/);
  assert.match(sql, /channel text not null[\s\S]*channel in \('email', 'sms', 'whatsapp'\)/);
  assert.match(sql, /message_template_versions[\s\S]*enabled boolean not null default false/);
  assert.match(
    sql,
    /company_message_template_overrides[\s\S]*enabled boolean not null default false/,
  );
  assert.match(sql, /runtime_delivery_preferences[\s\S]*enabled boolean not null default false/);
  assert.match(sql, /runtime_delivery_preferences[\s\S]*opted_out boolean not null default true/);
  assert.match(sql, /create or replace function public\.resolve_runtime_delivery_policy/);
  assert.match(
    sql,
    /resolve_runtime_delivery_policy[\s\S]*company_message_template_overrides[\s\S]*runtime_delivery_preferences/,
  );
});

test('stores only allowlisted provider delivery and reconciliation evidence', async () => {
  const sql = await migrationSql();
  const receiptTable = sql.match(
    /create table public\.runtime_delivery_receipts \(([\s\S]*?)\n\);/,
  )?.[1];

  assert.ok(receiptTable);
  for (const column of [
    'provider_category',
    'provider_code',
    'retryable',
    'effect_reference_hash',
    'event_id',
    'job_id',
    'delivery_state',
    'reconciliation_state',
    'attempted_at',
    'reconciled_at',
  ]) {
    assert.match(receiptTable, new RegExp(`\\b${column}\\b`));
  }
  assert.match(receiptTable, /effect_reference_hash[\s\S]*\^\[a-f0-9\]\{64\}\$/);
  assert.match(receiptTable, /unique \(job_id, attempt_number\)/);
  assert.doesNotMatch(
    receiptTable,
    /(?:^|\n)\s*(body|phone|email|token|signature|headers?|raw_response|message|content)\s+/,
  );
});

test('exposes bounded role-scoped reads and transactional audited mutations', async () => {
  const sql = await migrationSql();

  for (const rpc of [
    'list_operational_notifications',
    'list_operational_tasks',
    'list_operational_activity',
    'set_operational_notification_read_state',
    'resolve_runtime_delivery_policy',
    'write_operational_projection',
    'record_safe_delivery_receipt',
    'read_operational_runtime_health',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${rpc}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
      ),
    );
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${rpc}\\([^;]+ from public, anon, authenticated`),
    );
  }

  assert.match(sql, /p_limit between 1 and 100/);
  assert.match(
    sql,
    /created_at < p_before_created_at[\s\S]*created_at = p_before_created_at[\s\S]*id < p_before_id/,
  );
  assert.match(sql, /order by [a-z_.]+\.created_at desc, [a-z_.]+\.id desc/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /profile\.status::text = 'active'/);
  assert.match(sql, /assignment\.status::text = 'active'/);
  assert.match(sql, /insert into public\.operational_runtime_audit/);
  assert.match(
    sql,
    /grant execute on function public\.list_operational_notifications\([^;]+ to authenticated/,
  );
  assert.match(
    sql,
    /grant execute on function public\.write_operational_projection\([^;]+ to service_role/,
  );
  assert.doesNotMatch(sql, /grant (insert|update|delete|all) on table [^;]+ to authenticated/);
});

test('worker mutations validate event and job ownership without enabling consumers', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /write_operational_projection[\s\S]*domain_events[\s\S]*event_jobs[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id/,
  );
  assert.match(
    sql,
    /record_safe_delivery_receipt[\s\S]*domain_events[\s\S]*event_jobs[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id/,
  );
  assert.match(sql, /^begin;/);
  assert.match(sql, /commit;\s*$/);
  assert.doesNotMatch(sql, /insert into public\.event_consumer_registrations/);
  assert.doesNotMatch(sql, /update public\.event_consumer_registrations/);
  assert.doesNotMatch(sql, /delete from public\.event_consumer_registrations/);
  assert.doesNotMatch(sql, /p3_10_runtime_pending/);
});
