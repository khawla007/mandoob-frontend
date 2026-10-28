import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20261028120000_0124_bounded_lead_reply_routing.sql',
);

test('lead reply routing migration uses a bounded indexed service-role RPC', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  assert.match(sql, /create index lead_phone_normalized_match_idx/iu);
  assert.match(sql, /tenant_id, public\.normalize_lead_phone\(phone\)/iu);
  assert.match(sql, /create function public\.route_inbound_reply_to_lead/iu);
  assert.match(sql, /security definer/iu);
  assert.match(sql, /set search_path = ''/iu);
  assert.match(sql, /limit 101/iu);
  assert.match(sql, /LEAD_REPLY_CANDIDATE_LIMIT/iu);
  assert.match(sql, /pg_advisory_xact_lock/iu);
  assert.match(sql, /grant execute[\s\S]*to service_role/iu);
  assert.doesNotMatch(sql, /grant execute[\s\S]*to (?:public|anon|authenticated)/iu);
});
