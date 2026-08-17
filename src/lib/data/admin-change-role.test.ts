import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src/lib/data/admin-change-role.ts'), 'utf8');
const transition = readFileSync(
  join(process.cwd(), 'src/lib/data/admin-role-transition.ts'),
  'utf8',
);
const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260817092000_0061_admin_company_workflows.sql'),
  'utf8',
);

test('admin role changes delegate exact old and new claims to the fail-closed transition', () => {
  assert.match(source, /\.rpc\('admin_change_role_atomic'/);
  assert.doesNotMatch(source, /\.from\('(pro_profiles|customer_profiles|employees)'\)\.delete/);
  assert.doesNotMatch(source, /\.from\('(pro_profiles|customer_profiles|employees)'\)\.insert/);
  assert.doesNotMatch(source, /\.from\('profiles'\)[\s\S]{0,120}\.update/);
  assert.match(source, /await executeRoleChangeTransition\(/);
  assert.match(source, /\.select\('id, role, tenant_id, status, full_name, phone, updated_at'\)/);
  assert.match(source, /oldVersion: existing\.updated_at/);
  assert.match(source, /readCurrentSnapshot/);
  assert.match(source, /committedSnapshot/);
  assert.match(
    source,
    /oldClaims: \{[\s\S]*mandoob_role: oldRole,[\s\S]*tenant_id: existing\.tenant_id as string \| null,[\s\S]*mandoob_status: existing\.status as ProfileStatus,[\s\S]*mandoob_role_transition: null,[\s\S]*\}/,
  );
  assert.match(
    source,
    /newClaims: \{[\s\S]*mandoob_role: input\.newRole,[\s\S]*tenant_id: newTenantId,[\s\S]*mandoob_status: existing\.status as ProfileStatus,[\s\S]*mandoob_role_transition: null,[\s\S]*\}/,
  );
  assert.match(source, /revoke: \(\) => revokeAllSessions\(targetId\)/);
  assert.match(source, /app_metadata: claims/);
});

test('admin role change external failures are explicit without exposing provider details', () => {
  assert.match(transition, /SESSION_REVOKE_FAILED[\s\S]*Could not revoke user sessions/);
  assert.match(transition, /AUTH_METADATA_NEUTRALIZE_FAILED[\s\S]*disable user authorization/);
  assert.match(transition, /ROLE_CHANGE_RESTORE_FAILED[\s\S]*user remains signed out/);
  assert.match(transition, /AUTH_METADATA_SYNC_FAILED[\s\S]*login remains disabled/);
  assert.match(source, /Role change could not be completed/);
  assert.doesNotMatch(source, /`atomic role change: \$\{roleChangeError\.message\}`/);
  assert.match(source, /\(\?:EMPLOYEE\|CUSTOMER\)_COMPANY_TENANT_MISMATCH/);
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
  assert.match(migration, /returns jsonb/i);
  assert.match(migration, /returning \* into committed_profile/i);
  assert.match(
    migration,
    /jsonb_build_object\([\s\S]*'role'[\s\S]*'tenant_id'[\s\S]*'status'[\s\S]*'updated_at'/i,
  );
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
