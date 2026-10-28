import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20261027050000_0117_p3_10_notification_company_scope.sql';

test('notification read-state RPC is forward-replaced with required Company scope', () => {
  assert.equal(existsSync(migrationPath), true);
  const sql = readFileSync(migrationPath, 'utf8').toLowerCase();
  assert.match(
    sql,
    /drop function if exists public\.set_operational_notification_read_state\(uuid, boolean, uuid\)/u,
  );
  assert.match(
    sql,
    /set_operational_notification_read_state\(\s*p_company_id uuid,\s*p_notification_id uuid,\s*p_read boolean,\s*p_operation_id uuid\s*\)/u,
  );
  assert.match(sql, /notification\.company_id = p_company_id/u);
  assert.match(sql, /runtime_actor_company_access\(p_company_id, true\)/u);
  assert.match(sql, /security definer[\s\S]*set search_path = ''/u);
  assert.match(
    sql,
    /grant execute on function public\.set_operational_notification_read_state\(uuid, uuid, boolean, uuid\)\s+to authenticated/u,
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.set_operational_notification_read_state\(uuid, boolean, uuid\)/u,
  );
});
