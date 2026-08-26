import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260817092000_0061_admin_company_workflows.sql'),
  'utf8',
);
const assignmentMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260817091000_0060_company_assignment_rpcs_rls.sql'),
  'utf8',
);
const selfUpdateForwardMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260826100000_0085_pro_profile_self_update_columns.sql'),
  'utf8',
);
const selfUpdateForwardUpgradeSql = readFileSync(
  join(process.cwd(), 'supabase/tests/pro_profile_self_update_forward_upgrade.sql'),
  'utf8',
);

function functionDdl(name: string): string {
  const start = migration.indexOf(`function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = migration.indexOf('create or replace function public.', start + 1);
  return migration.slice(start, next < 0 ? migration.length : next);
}

for (const fn of [
  'verify_pro_credentials_atomic',
  'provision_company_workspace_atomic',
  'admin_change_role_atomic',
]) {
  test(`${fn} is fixed-search-path, service-role-only, and validates the live operator`, () => {
    const ddl = functionDdl(fn);
    assert.match(ddl, /security definer/iu);
    assert.match(ddl, /set search_path = pg_catalog, public/iu);
    assert.match(ddl, /actor\.role::text in \('admin', 'super_admin'\)/iu);
    assert.match(ddl, /actor\.status::text = 'active'/iu);
    assert.match(ddl, /select \* into actor[\s\S]*for update/iu);
    assert.match(
      ddl,
      new RegExp(
        `revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`,
        'iu',
      ),
    );
    assert.match(
      ddl,
      new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'iu'),
    );
    assert.doesNotMatch(ddl, /grant (?:all|execute)[\s\S]*to (?:public|anon|authenticated)/iu);
  });
}

test('credential verification locks the target, checks PRO/license readiness, updates provenance, and audits atomically', () => {
  assert.match(migration, /from public\.pro_profiles[\s\S]*for update/iu);
  assert.match(migration, /target_profile\.role::text = 'pro'/iu);
  assert.match(migration, /license_no_encrypted is null/iu);
  assert.match(
    migration,
    /credentials_verified = true[\s\S]*verified_at = pg_catalog\.now\(\)[\s\S]*verified_by_profile_id = p_actor_id/iu,
  );
  assert.match(migration, /insert into public\.admin_audit_actions[\s\S]*verify_pro_credentials/iu);
  assert.match(migration, /target_pro\.updated_at is distinct from p_expected_updated_at/iu);
  assert.match(migration, /message = 'STALE_CREDENTIALS'/iu);
  const verify = functionDdl('verify_pro_credentials_atomic');
  assert.ok(
    verify.indexOf('target_pro.updated_at is distinct from p_expected_updated_at') <
      verify.indexOf('if target_pro.credentials_verified'),
    'stale callers must fail before an idempotent replay can return',
  );
});

test('credential state is coherent, replay-safe, and unavailable to direct authenticated writes', () => {
  const verify = functionDdl('verify_pro_credentials_atomic');
  assert.match(
    verify,
    /credentials_verified[\s\S]*verified_at is not null[\s\S]*verified_by_profile_id is not null/iu,
  );
  assert.match(migration, /pro_credentials_verification_shape/iu);
  assert.match(
    migration,
    /set_pro_profile_updated_at[\s\S]*greatest\(clock_timestamp\(\), old\.updated_at \+ interval '1 microsecond'\)/iu,
  );
  assert.match(
    assignmentMigration,
    /revoke update on table public\.pro_profiles from public, anon, authenticated/iu,
  );
  assert.match(assignmentMigration, /grant update \(\s*service_areas, bio\s*\)[\s\S]*to authenticated/iu);
  assert.doesNotMatch(assignmentMigration, /grant update \(\s*designation, department/iu);
  assert.match(
    selfUpdateForwardMigration,
    /grant update \(\s*designation, department, service_areas, bio\s*\)[\s\S]*to authenticated/iu,
  );
  assert.match(selfUpdateForwardMigration, /revoke update on table public\.pro_profiles/iu);
  assert.match(selfUpdateForwardUpgradeSql, /has_column_privilege[\s\S]*designation[\s\S]*department/iu);
  assert.match(selfUpdateForwardUpgradeSql, /raise exception/iu);
});

test('expanded admin audit actions include credential verification but not tenant creation', () => {
  const constraint = migration.slice(0, migration.indexOf('alter table public.pro_profiles'));
  assert.match(constraint, /admin_audit_actions_action_check[\s\S]*verify_pro_credentials/iu);
  assert.doesNotMatch(constraint, /create_company_workspace/iu);
});

test('company provisioning inserts tenant, company, and audit in one RPC transaction', () => {
  assert.match(migration, /insert into public\.tenants/iu);
  assert.match(migration, /insert into public\.company_profiles/iu);
  const provision = functionDdl('provision_company_workspace_atomic');
  assert.match(provision, /insert into public\.tenant_audit_log/iu);
  assert.match(provision, /'company_id', v_company_id/iu);
  assert.match(provision, /'company_name', pg_catalog\.btrim\(p_company_name\)/iu);
  assert.doesNotMatch(provision, /insert into public\.admin_audit_actions/iu);
  assert.match(migration, /return jsonb_build_object\([\s\S]*'tenant_id'[\s\S]*'company_id'/iu);
  assert.doesNotMatch(migration, /delete from public\.tenants/iu);
});

test('company access requires current PRO verification without changing other role branches', () => {
  const access = functionDdl('has_company_access');
  assert.match(access, /set search_path = ''/iu);
  assert.match(access, /p\.role in \('admin', 'super_admin'\)/iu);
  assert.match(access, /p\.role in \('customer', 'employee'\)/iu);
  assert.match(access, /from public\.pro_profiles pro[\s\S]*pro\.credentials_verified = true/iu);
  assert.match(access, /from public\.pro_company_assignments/iu);
  assert.match(access, /grant execute[\s\S]*to authenticated, service_role/iu);
});

test('credential verifier provenance cannot be deleted out from under a verified PRO', () => {
  assert.match(
    migration,
    /drop constraint if exists pro_profiles_verified_by_profile_id_fkey[\s\S]*add constraint pro_profiles_verified_by_profile_id_fkey[\s\S]*on delete restrict/iu,
  );
});

test('role conversion makes PRO tenantless and resets credential verification', () => {
  assert.match(migration, /p_new_role in \('admin', 'pro'\)[\s\S]*p_new_tenant_id is not null/iu);
  assert.match(
    migration,
    /insert into public\.pro_profiles[\s\S]*credentials_verified[\s\S]*false/iu,
  );
});
