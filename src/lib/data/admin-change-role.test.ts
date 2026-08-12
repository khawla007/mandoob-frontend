import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-change-role.ts'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260812130000_0055_atomic_admin_role_change.sql'),
  'utf8',
);

test('admin role changes require session revocation before the atomic RPC and metadata sync', () => {
  assert.match(source, /\.rpc\('admin_change_role_atomic'/);
  assert.doesNotMatch(source, /\.from\('(pro_profiles|customer_profiles|employees)'\)\.delete/);
  assert.doesNotMatch(source, /\.from\('(pro_profiles|customer_profiles|employees)'\)\.insert/);
  assert.doesNotMatch(source, /\.from\('profiles'\)[\s\S]{0,120}\.update/);
  const revoke = source.indexOf('await revokeAllSessions');
  const rpc = source.indexOf(".rpc('admin_change_role_atomic'", revoke);
  const metadata = source.indexOf('updateUserById', rpc);
  assert.ok(revoke >= 0 && rpc > revoke && metadata > rpc);
  assert.match(
    source,
    /try\s*{\s*await revokeAllSessions[\s\S]*catch[\s\S]*throw new ApiError\([\s\S]*SESSION_REVOKE_FAILED[\s\S]*\n\s*}\n\n\s*const \{ error: roleChangeError \}/,
  );
});

test('admin role change external failures are explicit without exposing provider details', () => {
  assert.match(source, /SESSION_REVOKE_FAILED[\s\S]*Could not revoke user sessions/);
  assert.match(source, /AUTH_METADATA_SYNC_FAILED[\s\S]*Could not synchronize user auth metadata/);
  assert.doesNotMatch(source, /`auth metadata update: \$\{authUpdErr\.message\}`/);
  assert.doesNotMatch(source, /sessionRevokeError instanceof Error/);
  assert.match(source, /Role change could not be completed/);
  assert.doesNotMatch(source, /`atomic role change: \$\{roleChangeError\.message\}`/);
});

test('atomic role RPC validates case references before any role mutation', () => {
  const guard = migration.indexOf('PROFILE_TENANT_HAS_SERVICE_CASE_REFERENCES');
  const firstMutation = Math.min(
    migration.indexOf('delete from public.pro_profiles'),
    migration.indexOf('delete from public.customer_profiles'),
    migration.indexOf('delete from public.employees'),
  );
  assert.ok(guard >= 0 && firstMutation > guard);
  assert.match(migration, /from public\.profiles[\s\S]*where id = p_target_id[\s\S]*for update/i);
  assert.match(
    migration,
    /current_profile\.role::text is distinct from p_expected_role[\s\S]*current_profile\.tenant_id is distinct from p_expected_tenant_id/i,
  );
  assert.match(
    migration,
    /assigned_to = p_target_id[\s\S]*or service_case\.created_by = p_target_id/i,
  );
  assert.match(migration, /p_new_tenant_id is distinct from current_profile\.tenant_id/i);
});

test('atomic role RPC covers every role subtable, profile patch, and audit in one transaction', () => {
  for (const table of ['pro_profiles', 'customer_profiles', 'employees']) {
    assert.match(migration, new RegExp(`delete from public\\.${table}`));
  }
  assert.match(migration, /insert into public\.pro_profiles/i);
  assert.match(migration, /insert into public\.customer_profiles/i);
  assert.match(migration, /insert into public\.employees/i);
  assert.match(
    migration,
    /update public\.profiles[\s\S]*role = p_new_role::public\.app_role[\s\S]*tenant_id = p_new_tenant_id/i,
  );
  assert.match(migration, /insert into public\.admin_audit_actions/i);
  assert.doesNotMatch(migration, /exception[\s\S]*when others/i);
});

test('atomic role RPC is fixed-search-path security definer and service-role only', () => {
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = pg_catalog, public/i);
  assert.match(
    migration,
    /revoke all on function public\.admin_change_role_atomic[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.admin_change_role_atomic[\s\S]*to service_role/i,
  );
});
