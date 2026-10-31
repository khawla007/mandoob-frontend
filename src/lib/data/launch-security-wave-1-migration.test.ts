import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const migrationPath = resolve(
  process.cwd(),
  'supabase/migrations/20261031010000_0126_launch_security_wave_1.sql',
);
const fixturePath = resolve(process.cwd(), 'supabase/tests/launch_security_wave_1.sql');
const runnerPath = resolve(process.cwd(), 'scripts/run-sql-integration.sh');

function compact(path: string): string {
  return readFileSync(path, 'utf8').replace(/--.*$/gmu, '').replace(/\s+/gu, ' ');
}

test('0126 defines one fixed-search-path service-only delivery transition RPC', () => {
  assert.ok(existsSync(migrationPath), 'forward launch-security migration is required');
  const sql = compact(migrationPath);

  assert.match(
    sql,
    /create or replace function public\.apply_provider_delivery_status\( p_channel text, p_provider text, p_provider_message_id text, p_provider_status text, p_provider_occurred_at timestamptz default null, p_safe_error_code text default null \) returns jsonb language plpgsql security definer set search_path = ''/iu,
  );
  assert.match(sql, /for update/iu, 'the target delivery row must be locked before inspection');
  assert.match(sql, /v_channel not in \('sms', 'whatsapp'\)/iu);
  assert.match(sql, /v_provider not in \('twilio', 'unifonic', 'whatsapp'\)/iu);
  assert.match(sql, /pg_catalog\.octet_length\(p_channel\)[^;]+between 1 and 16/iu);
  assert.match(sql, /pg_catalog\.octet_length\(p_provider\)[^;]+between 1 and 16/iu);
  assert.match(sql, /pg_catalog\.octet_length\(p_provider_message_id\)/iu);
  assert.match(sql, /pg_catalog\.octet_length\(p_provider_status\)/iu);
  assert.match(sql, /v_current_rank/iu);
  assert.match(sql, /v_target_rank/iu);
  assert.match(sql, /v_current_terminal/iu);
  assert.match(sql, /jsonb_build_object\('outcome', v_outcome\)/iu);
  assert.doesNotMatch(
    sql,
    /jsonb_build_object\([^;]*(?:provider_message_id|row_id|message_id)/iu,
    'RPC result must never disclose queue identifiers',
  );
  assert.match(
    sql,
    /revoke all on function public\.apply_provider_delivery_status\(text,text,text,text,timestamptz,text\) from public, anon, authenticated/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.apply_provider_delivery_status\(text,text,text,text,timestamptz,text\) to service_role/iu,
  );
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:public|anon|authenticated)/iu);
});

test('0126 declares monotonic mappings, terminal protection, and safe timestamp/error writes', () => {
  const sql = compact(migrationPath);

  for (const status of ['pending', 'sent', 'delivered', 'read', 'failed', 'dead']) {
    assert.match(sql, new RegExp(`'${status}'`, 'u'));
  }
  assert.match(sql, /v_current_status = v_target_status[\s\S]*v_outcome := 'replayed'/iu);
  assert.match(
    sql,
    /v_current_terminal or v_target_rank < v_current_rank[\s\S]*v_outcome := 'stale'/iu,
  );
  assert.match(
    sql,
    /v_channel = 'sms'[\s\S]*v_current_status = 'delivered'[\s\S]*v_outcome := 'stale'/iu,
    'SMS delivered must reject contradictory terminal callbacks',
  );
  assert.match(
    sql,
    /v_channel = 'whatsapp'[\s\S]*v_current_status = 'delivered'[\s\S]*v_target_status in \('failed', 'dead'\)[\s\S]*v_outcome := 'stale'/iu,
    'WhatsApp delivered may advance to read but must reject failure/dead',
  );
  assert.match(
    sql,
    /v_channel = 'whatsapp'[\s\S]*v_current_status = 'read'[\s\S]*v_outcome := 'stale'/iu,
    'WhatsApp read must be terminal',
  );
  assert.match(sql, /sent_at = coalesce\([^;]+p_provider_occurred_at[^;]+clock_timestamp/iu);
  assert.match(sql, /delivered_at = coalesce\([^;]+p_provider_occurred_at[^;]+clock_timestamp/iu);
  assert.match(sql, /read_at = coalesce\([^;]+p_provider_occurred_at[^;]+clock_timestamp/iu);
  assert.match(sql, /p_safe_error_code ~ '\^\[A-Za-z0-9_.:-\]\{1,64\}\$'/u);
  assert.doesNotMatch(sql, /p_safe_error_code[^;]*message/iu);
});

test('transactional fixture covers outcomes, privilege boundaries, and timestamp preservation', () => {
  assert.ok(existsSync(fixturePath), 'launch-security transactional fixture is required');
  const fixture = compact(fixturePath);

  assert.match(fixture, /\\set ON_ERROR_STOP on/iu);
  assert.match(fixture, /begin;[\s\S]*rollback;/iu);
  for (const marker of [
    'SMS_FORWARD_APPLIED',
    'SMS_REPLAYED',
    'SMS_STALE_REJECTED',
    'SMS_TERMINAL_PROTECTED',
    'SMS_SUCCESS_TERMINAL_PROTECTED',
    'WHATSAPP_FORWARD_APPLIED',
    'WHATSAPP_REPLAYED',
    'WHATSAPP_STALE_REJECTED',
    'WHATSAPP_TERMINAL_PROTECTED',
    'WHATSAPP_DELIVERED_FAILURE_REJECTED',
    'WHATSAPP_READ_TERMINAL_PROTECTED',
    'UNKNOWN_ACKNOWLEDGED',
    'NOT_FOUND_REDACTED',
    'TIMESTAMPS_PRESERVED',
    'CALLBACK_CLOCK_FALLBACK',
    'SAFE_ERROR_CODE_ONLY',
    'ANON_EXECUTE_DENIED',
    'AUTHENTICATED_EXECUTE_DENIED',
    'SERVICE_ROLE_EXECUTE_ALLOWED',
    'LAUNCH_SECURITY_WAVE_1_PASS',
  ]) {
    assert.match(fixture, new RegExp(marker, 'u'));
  }
  assert.doesNotMatch(fixture, /session_replication_role/iu);
});

test('SQL runner executes the fixture and a real two-session serialization probe', () => {
  const runner = compact(runnerPath);
  assert.match(runner, /"launch_security_wave_1\.sql"/u);
  assert.match(runner, /delivery-status-concurrency-call-a\.sql/u);
  assert.match(runner, /delivery-status-concurrency-call-b\.sql/u);
  assert.match(runner, /delivery-status-concurrency-verify\.sql/u);
  assert.match(runner, /delivery_pid_a=\$!/u);
  assert.match(runner, /delivery_pid_b=\$!/u);
  assert.match(runner, /wait "\$delivery_pid_a"/u);
  assert.match(runner, /wait "\$delivery_pid_b"/u);
  assert.match(runner, /grep -Fx "stale" \/tmp\/delivery-concurrency-b\.out/u);
  assert.match(runner, /concurrency_probes=3/u);
});
