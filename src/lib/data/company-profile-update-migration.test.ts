import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260818090000_0062_company_profile_update_rpc.sql'),
  'utf8',
);

test('profile update RPC locks live ownership and writes profile plus audit atomically', () => {
  assert.match(migration, /create or replace function public\.update_assigned_company_profile/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(
    migration,
    /public\.profiles[\s\S]*role = 'pro'[\s\S]*status = 'active'[\s\S]*for update/,
  );
  assert.match(
    migration,
    /public\.pro_profiles[\s\S]*profile_id = p_actor_profile_id[\s\S]*credentials_verified = true[\s\S]*for update/,
  );
  assert.match(
    migration,
    /public\.pro_company_assignments[\s\S]*pro_profile_id = p_actor_profile_id[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id[\s\S]*status = 'active'[\s\S]*for update/,
  );
  assert.match(migration, /updated_at <> p_expected_updated_at[\s\S]*STALE_COMPANY_PROFILE/);
  assert.match(
    migration,
    /update public\.company_profiles[\s\S]*where id = p_company_id[\s\S]*and tenant_id = p_tenant_id/,
  );
  assert.match(migration, /returning updated_at into v_updated_at/);
  assert.doesNotMatch(migration, /clock_timestamp\(\)/);
  assert.match(
    migration,
    /insert into public\.tenant_audit_log[\s\S]*'updated'[\s\S]*'self_serve'/,
  );
});

test('profile update RPC is service-role only with a fixed complete signature', () => {
  assert.match(
    migration,
    /revoke all on function public\.update_assigned_company_profile\([\s\S]*\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.update_assigned_company_profile\([\s\S]*\) to service_role/,
  );
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
});
