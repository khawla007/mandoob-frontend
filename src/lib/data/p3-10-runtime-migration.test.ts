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

function rpcSql(sql: string, name: string): string {
  const match = sql.match(
    new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`),
  );
  assert.ok(match, `missing RPC ${name}`);
  return match[0];
}

function requestIntentSql(body: string): string {
  const match = body.match(
    /v_request_hash := public\.runtime_request_hash\(pg_catalog\.jsonb_build_object\(([\s\S]*?)\n  \)\);/,
  );
  assert.ok(match, 'missing canonical request intent');
  return match[1];
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

test('worker projection and receipt RPCs require a current matching lease fence', async () => {
  const sql = await migrationSql();

  for (const rpc of ['write_operational_projection', 'record_safe_delivery_receipt']) {
    const body = rpcSql(sql, rpc);
    assert.match(body, /p_worker_id uuid/);
    assert.match(body, /p_lease_token uuid/);
    assert.match(body, /job\.state = 'leased'/);
    assert.match(body, /job\.lease_owner = p_worker_id/);
    assert.match(body, /job\.lease_token = p_lease_token/);
    assert.match(body, /job\.lease_expires_at > pg_catalog\.statement_timestamp\(\)/);
    assert.match(body, /company\.status::text = 'active'/);
    assert.match(body, /tenant\.status = 'active'/);
  }
  assert.match(
    sql,
    /grant execute on function public\.write_operational_projection\(\s*uuid, uuid, uuid, uuid, uuid, uuid, uuid,/,
  );
  assert.match(
    sql,
    /grant execute on function public\.record_safe_delivery_receipt\(\s*uuid, uuid, uuid, uuid, uuid, uuid, uuid, smallint,/,
  );
});

test('operation replay requires an exact deterministic request fingerprint', async () => {
  const sql = await migrationSql();

  assert.match(
    sql,
    /operational_runtime_audit[\s\S]*request_hash text not null[\s\S]*request_hash ~ '\^\[a-f0-9\]\{64\}\$'/,
  );
  assert.match(sql, /create or replace function public\.runtime_request_hash\(p_intent jsonb\)/);
  assert.match(sql, /extensions\.digest[\s\S]*'sha256'/);

  for (const rpc of [
    'set_operational_notification_read_state',
    'write_operational_projection',
    'record_safe_delivery_receipt',
  ]) {
    const body = rpcSql(sql, rpc);
    assert.match(body, /v_request_hash text/);
    assert.match(body, /public\.runtime_request_hash\(pg_catalog\.jsonb_build_object/);
    assert.match(body, /v_existing\.request_hash <> v_request_hash/);
    assert.match(body, /request_hash/);
    assert.match(body, /insert into public\.operational_runtime_audit/);
  }
  const readIntent = requestIntentSql(rpcSql(sql, 'set_operational_notification_read_state'));
  for (const argument of ['v_actor_id', 'p_notification_id', 'p_read']) {
    assert.match(readIntent, new RegExp(`\\b${argument}\\b`));
  }

  const projectionIntent = requestIntentSql(rpcSql(sql, 'write_operational_projection'));
  for (const argument of [
    'p_tenant_id',
    'p_company_id',
    'p_event_id',
    'p_job_id',
    'p_worker_id',
    'p_lease_token',
    'p_projection_type',
    'p_projection_key',
    'p_code',
    'p_profile_id',
    'p_state',
    'p_priority',
    'p_due_at',
    'p_safe_metadata',
  ]) {
    assert.match(projectionIntent, new RegExp(`\\b${argument}\\b`));
  }

  const receiptIntent = requestIntentSql(rpcSql(sql, 'record_safe_delivery_receipt'));
  for (const argument of [
    'p_tenant_id',
    'p_company_id',
    'p_event_id',
    'p_job_id',
    'p_worker_id',
    'p_lease_token',
    'p_attempt_number',
    'p_channel',
    'p_provider_category',
    'p_provider_code',
    'p_retryable',
    'p_effect_reference_hash',
    'p_delivery_state',
    'p_reconciliation_state',
    'p_attempted_at',
    'p_reconciled_at',
  ]) {
    assert.match(receiptIntent, new RegExp(`\\b${argument}\\b`));
  }
});

test('database constraints bind every projection and audit job to its event', async () => {
  const sql = await migrationSql();

  assert.match(sql, /alter table public\.event_jobs[\s\S]*unique \(id, event_id\)/);
  for (const table of [
    'operational_notifications',
    'operational_tasks',
    'operational_activity',
    'operational_runtime_audit',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `${table}[\\s\\S]*foreign key \\(source_job_id, source_event_id\\)[\\s\\S]*references public\\.event_jobs \\(id, event_id\\)`,
      ),
    );
  }
  assert.match(
    sql,
    /runtime_delivery_receipts[\s\S]*foreign key \(job_id, event_id\)[\s\S]*references public\.event_jobs \(id, event_id\)/,
  );
});

test('each role-scoped list is bounded, authorized, stable, and mutations are audited', async () => {
  const sql = await migrationSql();

  for (const rpc of [
    'list_operational_notifications',
    'list_operational_tasks',
    'list_operational_activity',
  ]) {
    const body = rpcSql(sql, rpc);
    assert.match(body, /p_limit between 1 and 100/);
    assert.match(body, /public\.runtime_actor_company_access\(p_company_id, true\)/);
    assert.match(body, /created_at < p_before_created_at/);
    assert.match(body, /created_at = p_before_created_at[\s\S]*id < p_before_id/);
    assert.match(body, /order by [a-z_.]+\.created_at desc, [a-z_.]+\.id desc/);
  }

  const access = rpcSql(sql, 'runtime_actor_company_access');
  assert.match(access, /tenant\.status = 'active'/);
  assert.match(access, /company\.status::text = 'active'/);
  assert.match(
    rpcSql(sql, 'read_operational_runtime_health'),
    /public\.runtime_actor_company_access\(p_company_id, false\)/,
  );

  for (const rpc of [
    'set_operational_notification_read_state',
    'write_operational_projection',
    'record_safe_delivery_receipt',
  ]) {
    assert.match(rpcSql(sql, rpc), /insert into public\.operational_runtime_audit/);
  }
});
