import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261027040000_0116_p3_10_leased_cancellation.sql'),
  'utf8',
);

test('0116 adds an exact fenced leased cancellation transition', () => {
  assert.match(
    sql,
    /create function public\.cancel_leased_event_job\(\s*p_job_id uuid,\s*p_worker_id uuid,\s*p_lease_token uuid,\s*p_error_code text/u,
  );
  assert.match(sql, /security definer\s+set search_path = ''/u);
  assert.match(sql, /p_error_code is null\s+or p_error_code !~/u);
  assert.match(sql, /where job\.id = p_job_id\s+for update/u);
  assert.match(sql, /v_job\.state <> 'leased'/u);
  assert.match(sql, /v_job\.lease_owner is distinct from p_worker_id/u);
  assert.match(sql, /v_job\.lease_token is distinct from p_lease_token/u);
  assert.match(sql, /v_job\.lease_expires_at <= pg_catalog\.clock_timestamp\(\)/u);
  assert.match(sql, /set state = 'cancelled'/u);
  assert.match(sql, /lease_owner = null/u);
  assert.match(sql, /insert into public\.event_job_attempts/u);
  assert.match(sql, /'cancelled', p_worker_id, p_lease_token/u);
  assert.match(sql, /revoke all on function public\.cancel_leased_event_job/u);
  assert.match(
    sql,
    /grant execute on function public\.cancel_leased_event_job\(uuid, uuid, uuid, text\) to service_role/u,
  );
});
