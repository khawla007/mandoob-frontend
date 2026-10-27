import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261027030000_0115_p3_10_runtime_replay_safety.sql',
);
const sql = readFileSync(migrationPath, 'utf8');

function functionBody(): string {
  const match = sql.match(
    /create or replace function public\.write_operational_projection\([\s\S]+?\n\$\$;/u,
  );
  assert.ok(match, '0115 must replace write_operational_projection');
  return match[0];
}

test('0115 keeps current lease fencing and live tenant/company scope checks', () => {
  const body = functionBody();
  assert.match(body, /job\.id = p_job_id/u);
  assert.match(body, /job\.event_id = p_event_id/u);
  assert.match(body, /v_job\.lease_owner is distinct from p_worker_id/u);
  assert.match(body, /v_job\.lease_token is distinct from p_lease_token/u);
  assert.match(body, /v_job\.effect_key <> 'mandoob:event-job:' \|\| p_operation_id::text/u);
  assert.match(body, /v_job\.lease_expires_at <= pg_catalog\.clock_timestamp\(\)/u);
  assert.match(body, /company\.status::text = 'active'/u);
  assert.match(body, /tenant\.status = 'active'/u);
});

test('0115 hashes stable projection intent without ephemeral job or lease identity', () => {
  const body = functionBody();
  const intent = body.match(/v_request_hash :=[\s\S]+?\n  \)\);/u)?.[0] ?? '';
  assert.match(intent, /'eventId', p_event_id/u);
  assert.match(intent, /'projectionType', p_projection_type/u);
  assert.match(intent, /'projectionKey', p_projection_key/u);
  assert.doesNotMatch(intent, /p_job_id|p_worker_id|p_lease_token/u);
});

test('0115 accepts exact replay rows across jobs but rejects changed intent', () => {
  const body = functionBody();
  assert.match(body, /audit\.operation_id = p_operation_id/u);
  assert.match(body, /v_existing\.request_hash <> v_request_hash/u);
  assert.match(body, /message = 'RUNTIME_OPERATION_REUSED'/u);
  assert.doesNotMatch(body, /source_job_id = p_job_id/u);
  assert.match(
    sql,
    /grant execute on function public\.write_operational_projection\(\s*uuid, uuid, uuid, uuid, uuid, uuid, uuid,/u,
  );
});
