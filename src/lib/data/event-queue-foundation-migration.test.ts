import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916050000_0093_event_queue_foundation.sql',
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return (await readFile(migrationUrl, 'utf8')).toLowerCase();
}

test('event queue migration freezes durable state and tenant/company ownership', async () => {
  const sql = await migrationSql();

  for (const table of [
    'event_consumer_registrations',
    'domain_events',
    'event_jobs',
    'event_job_attempts',
    'event_replay_requests',
    'inbound_destinations',
    'inbound_webhook_receipts',
    'event_worker_heartbeats',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(sql, /foreign key \(tenant_id, company_id\)/);
  assert.match(sql, /references public\.company_profiles \(tenant_id, id\)/);
  assert.match(sql, /unique \(event_type, event_version, dedupe_key\)/);
  assert.match(sql, /privacy_class in \('public', 'internal', 'confidential', 'restricted'\)/);
  assert.match(sql, /jsonb_typeof\(payload\) = 'object'/);
  assert.match(sql, /create or replace function public\.event_payload_is_safe/);
  assert.match(sql, /not public\.event_payload_is_safe\(p_payload\)/);
  assert.match(sql, /message\|mobile\|national/);
  assert.match(
    sql,
    /pending[\s\S]*leased[\s\S]*succeeded[\s\S]*retryable[\s\S]*dead[\s\S]*cancelled[\s\S]*replayed/,
  );
  assert.match(sql, /replay_of_job_id/);
  assert.match(sql, /effect_key/);
});

test('event queue migration exposes atomic fenced worker RPCs only to service role', async () => {
  const sql = await migrationSql();

  for (const rpc of [
    'publish_domain_event',
    'claim_event_jobs',
    'extend_event_job_lease',
    'complete_event_job',
    'fail_event_job',
    'cancel_event_job',
    'record_event_worker_heartbeat',
    'reserve_inbound_webhook',
    'read_event_queue_health',
  ]) {
    assert.match(sql, new RegExp(`create or replace function public\\.${rpc}`));
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to service_role`),
    );
  }

  assert.match(sql, /for update skip locked/);
  assert.match(sql, /lease_token = gen_random_uuid\(\)/);
  assert.match(sql, /lease_expires_at > pg_catalog\.now\(\)/);
  assert.match(sql, /p_batch_size between 1 and 100/);
  assert.match(sql, /p_lease_seconds between 15 and 900/);
  assert.match(sql, /job\.attempts < job\.max_attempts/);
  assert.match(sql, /hashtextextended/);
  assert.match(sql, /set search_path = ''/);
  assert.doesNotMatch(sql, /returning \*,\s*true\s+into/);
  assert.doesNotMatch(sql, /pg_catalog\.(extract|least|greatest|coalesce)\(/);
  for (const table of [
    'event_consumer_registrations',
    'domain_events',
    'event_jobs',
    'event_job_attempts',
    'event_replay_requests',
    'inbound_destinations',
    'inbound_webhook_receipts',
    'event_worker_heartbeats',
  ]) {
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`));
  }
  assert.doesNotMatch(sql, /grant (insert|update|delete|all).* to authenticated/);
  assert.doesNotMatch(sql, /grant all on table .* to service_role/);
});

test('manual replay is AAL2 operator-only, audited, and concurrency-idempotent', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create or replace function public\.request_event_job_replay/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /auth\.jwt\(\)[\s\S]*->> 'aal'[\s\S]*<> 'aal2'/);
  assert.match(sql, /profile\.role in \('admin', 'super_admin'\)/);
  assert.match(sql, /profile\.status = 'active'/);
  assert.match(sql, /source_job\.state not in \('succeeded', 'dead', 'cancelled'\)/);
  assert.match(sql, /unique \(requested_by, operation_id\)/);
  assert.match(
    sql,
    /grant execute on function public\.request_event_job_replay\([^;]+ to authenticated/,
  );
  assert.match(sql, /insert into public\.event_replay_requests/);
  assert.match(sql, /'replayed'/);
});

test('inbound routing uses destination hashes, timestamp tolerance, and replay receipts', async () => {
  const sql = await migrationSql();

  assert.match(sql, /destination_key_hash text not null/);
  assert.match(sql, /unique \(provider, destination_key_hash\)/);
  assert.match(sql, /provider_event_id_hash text not null/);
  assert.match(sql, /unique \(provider, destination_id, provider_event_id_hash\)/);
  assert.match(sql, /p_signature_verified is not true/);
  assert.match(sql, /p_occurred_at < pg_catalog\.now\(\) - interval '5 minutes'/);
  assert.match(sql, /p_occurred_at > pg_catalog\.now\(\) \+ interval '5 minutes'/);
  assert.doesNotMatch(
    sql,
    /signature text|raw_response|access_token|message_body|authorization_header/,
  );
});

test('attempts and events are append-only and diagnostics stay allowlisted', async () => {
  const sql = await migrationSql();

  assert.match(sql, /create trigger domain_events_immutable/);
  assert.match(sql, /create trigger event_job_attempts_immutable/);
  assert.match(sql, /raise exception using errcode = '55000'/);
  assert.match(sql, /error_category in \(/);
  assert.match(sql, /error_code ~ '\^\[a-z\]\[a-z0-9_\]/);
  assert.match(sql, /char_length\(error_code\) <= 64/);
});
