import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260915090000_0087_reconcile_existing_pro_access.sql',
);

function migration(): string {
  return readFileSync(migrationPath, 'utf8')
    .replace(/--[^\r\n]*/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

test('production PRO access recovery is an atomic fail-closed migration', () => {
  assert.equal(existsSync(migrationPath), true, 'recovery migration is missing');
  const sql = migration();

  assert.match(sql, /^begin;/u);
  assert.match(sql, /commit;$/u);
  assert.match(sql, /production_pro_recovery_expected_two_active_pros/u);
  assert.match(sql, /production_pro_recovery_expected_one_firm_pro/u);
  assert.match(sql, /production_pro_recovery_expected_one_nova_pro/u);
  assert.match(sql, /production_pro_recovery_expected_one_company/u);
  assert.match(sql, /production_pro_recovery_expected_one_super_admin/u);

  const firstMutation = Math.min(
    ...['insert into public.pro_profiles', 'insert into public.pro_credentials'].map((needle) =>
      sql.indexOf(needle),
    ),
  );
  assert.ok(firstMutation > sql.indexOf('production_pro_recovery_expected_one_super_admin'));
});

test('recovery creates both PRO profiles but grants operational access only to Firm', () => {
  const sql = migration();

  assert.match(sql, /insert into public\.pro_profiles[\s\S]*v_firm_pro_id[\s\S]*v_nova_pro_id/u);
  assert.match(sql, /insert into public\.pro_credentials[\s\S]*'pro_license'[\s\S]*'verified'/u);
  assert.match(sql, /mandoob temporary test credential/u);
  assert.match(sql, /insert into public\.pro_company_assignments/u);
  assert.match(sql, /public\.authorize_pro_company_access/u);
  assert.match(sql, /production_pro_recovery_firm_access_not_authorized/u);
  assert.match(sql, /production_pro_recovery_nova_must_remain_unassigned/u);
  assert.doesNotMatch(sql, /insert into public\.pro_commercial_terms/u);
  assert.doesNotMatch(sql, /update auth\.users/u);
});

test('recovery records credential and assignment audit history without an invented identifier', () => {
  const sql = migration();

  assert.match(sql, /insert into public\.pro_credential_decisions/u);
  assert.match(sql, /perform public\.write_pro_lifecycle_audit/u);
  assert.match(sql, /insert into public\.tenant_audit_log/u);
  assert.match(sql, /'production_access_recovery'/u);
  assert.match(sql, /identifier_ciphertext[\s\S]*identifier_hash[\s\S]*identifier_last4/u);
  assert.match(sql, /null, null, null/u);
});
