import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrations = join(process.cwd(), 'supabase/migrations');
const original = readFileSync(
  join(migrations, '20260818090000_0062_company_profile_update_rpc.sql'),
  'utf8',
);
const replacement = readFileSync(
  join(migrations, '20260821091000_0066_company_onboarding_workflows.sql'),
  'utf8',
);

test('historical profile update RPC locked live ownership and wrote profile plus audit atomically', () => {
  assert.match(original, /create or replace function public\.update_assigned_company_profile/);
  assert.match(original, /security definer/);
  assert.match(original, /set search_path = ''/);
  assert.match(
    original,
    /public\.pro_company_assignments[\s\S]*pro_profile_id = p_actor_profile_id[\s\S]*tenant_id = p_tenant_id[\s\S]*company_id = p_company_id[\s\S]*status = 'active'[\s\S]*for update/,
  );
  assert.match(original, /updated_at <> p_expected_updated_at[\s\S]*STALE_COMPANY_PROFILE/);
  assert.match(
    original,
    /update public\.company_profiles[\s\S]*where id = p_company_id[\s\S]*and tenant_id = p_tenant_id/,
  );
  assert.match(original, /insert into public\.tenant_audit_log[\s\S]*'updated'[\s\S]*'self_serve'/);
});

test('normalized onboarding forward migration retires execution of the legacy editor RPC', () => {
  assert.match(
    replacement,
    /revoke all on function public\.update_assigned_company_profile\([\s\S]*\) from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    replacement,
    /grant execute on function public\.update_assigned_company_profile/,
  );
});
