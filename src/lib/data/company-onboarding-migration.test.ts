import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPaths = [
  'supabase/migrations/20260821090000_0065_company_onboarding_schema.sql',
  'supabase/migrations/20260821091000_0066_company_onboarding_workflows.sql',
  'supabase/migrations/20260821092000_0067_company_onboarding_security_reconciliation.sql',
];

function migration(index: number) {
  return readFileSync(join(process.cwd(), migrationPaths[index]!), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

test('0065 defines the normalized onboarding schema and ownership constraints', () => {
  const sql = migration(0);
  for (const table of [
    'company_shareholders',
    'company_registered_activities',
    'company_office_details',
    'company_bank_details',
    'company_onboarding_sections',
    'company_onboarding_operations',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
    assert.match(sql, new RegExp(`foreign key \\(tenant_id, company_id\\)`, 'u'));
  }
  assert.match(sql, /numeric\(7,4\)/u);
  assert.match(sql, /primary key \(company_id, section_key\)/u);
  assert.match(sql, /primary key \(company_id, operation_id\)/u);
  assert.match(sql, /unique[\s\S]*lower\(licensing_authority\)[\s\S]*upper\(trade_license_no\)/u);
  assert.match(sql, /unsupported_company_onboarding_json/u);
  assert.match(sql, /drop column shareholders/u);
  assert.match(sql, /drop column registered_activities/u);
  assert.match(sql, /drop column office_address/u);
  assert.match(sql, /drop column bank_details/u);
  assert.doesNotMatch(sql, /\bis_ready\b/u);
});

test('0066 defines fixed-path service workflows, receipts, and redacted audit events', () => {
  const sql = migration(1);
  for (const fn of [
    'read_company_onboarding',
    'save_company_legal_section',
    'save_company_shareholders_section',
    'save_company_activities_section',
    'save_company_office_section',
    'save_company_establishment_section',
    'save_company_bank_section',
    'clear_company_bank_identifier',
    'reopen_company_onboarding_section',
    'submit_company_onboarding_for_activation',
    'evaluate_company_activation_readiness',
    'activate_company_onboarding',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(
      sql,
      new RegExp(`${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = ''`, 'u'),
    );
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'u'));
  }
  assert.match(sql, /p_expected_onboarding_version bigint/u);
  assert.match(sql, /p_operation_id uuid/u);
  assert.match(sql, /company_onboarding_operations/u);
  assert.match(sql, /operation_reused/u);
  assert.match(sql, /stale_onboarding_version/u);
  assert.match(sql, /company_activation_attempted/u);
  assert.match(sql, /company_activated/u);
  const aggregateRead = sql.slice(
    sql.indexOf('function public.read_company_onboarding'),
    sql.indexOf('function public.cleanup_company_onboarding_operations'),
  );
  for (const protectedColumn of [
    'establishment_card_no_encrypted',
    'establishment_card_no_hash',
    'iban_encrypted',
    'iban_hash',
    'account_number_encrypted',
    'account_number_hash',
  ]) {
    assert.doesNotMatch(
      aggregateRead,
      new RegExp(`company\\.${protectedColumn}|bank\\.${protectedColumn}`, 'u'),
    );
  }
});

test('0066 mutation signatures carry actor, ownership, version, and operation identity', () => {
  const sql = migration(1);
  for (const fn of [
    'save_company_legal_section',
    'save_company_shareholders_section',
    'save_company_activities_section',
    'save_company_office_section',
    'save_company_establishment_section',
    'save_company_bank_section',
    'clear_company_bank_identifier',
    'reopen_company_onboarding_section',
    'submit_company_onboarding_for_activation',
    'activate_company_onboarding',
  ]) {
    const signature = new RegExp(`function public\\.${fn}\\s*\\(([^)]*)\\)`, 'u').exec(sql)?.[1];
    assert.ok(signature, `${fn} signature must exist`);
    for (const parameter of [
      'p_actor_id uuid',
      'p_tenant_id uuid',
      'p_company_id uuid',
      'p_expected_onboarding_version bigint',
      'p_operation_id uuid',
    ]) {
      assert.match(signature, new RegExp(parameter, 'u'), `${fn} requires ${parameter}`);
    }
  }
  const activation = /function public\.activate_company_onboarding\s*\(([^)]*)\)/u.exec(sql)?.[1];
  assert.doesNotMatch(activation ?? '', /ready|is_ready|requirements/u);
});

test('0066 covers every readiness code and bounded operation receipt retention', () => {
  const sql = migration(1);
  for (const code of [
    'legal_section_incomplete',
    'legal_name_missing',
    'jurisdiction_type_missing',
    'licensing_authority_missing',
    'legal_structure_missing',
    'trade_license_missing',
    'license_expiry_missing',
    'license_expired',
    'shareholders_section_incomplete',
    'shareholder_missing',
    'ownership_total_not_100',
    'activities_section_incomplete',
    'activity_missing',
    'primary_activity_missing',
    'office_section_incomplete',
    'office_type_missing',
    'office_address_missing',
    'office_lease_reference_missing',
    'office_lease_expiry_missing',
    'office_lease_expired',
    'establishment_section_incomplete',
    'establishment_card_missing',
    'establishment_card_expiry_missing',
    'establishment_card_expired',
    'bank_section_incomplete',
    'bank_account_missing',
    'active_verified_pro_assignment_missing',
    'tenant_not_activatable',
  ]) {
    assert.match(sql, new RegExp(`'${code}'`, 'u'));
  }
  assert.match(sql, /created_at < pg_catalog\.now\(\) - interval '90 days'/u);
  assert.match(sql, /30 2 \* \* \*/u);
});

test('company onboarding SQL fixtures cover readiness and bounded concurrency races', () => {
  const fixtures = [
    'company_onboarding_readiness.sql',
    'company_onboarding_concurrency_setup.sql',
    'company_onboarding_activation_session_a.sql',
    'company_onboarding_activation_session_b.sql',
    'company_onboarding_save_session_a.sql',
    'company_onboarding_save_session_b.sql',
  ];
  for (const fixture of fixtures) {
    const path = join(process.cwd(), 'supabase/tests', fixture);
    assert.equal(existsSync(path), true, `${fixture} must exist`);
    const source = readFileSync(path, 'utf8');
    assert.match(source, /ON_ERROR_STOP on/u);
    assert.match(source, /statement_timeout/u);
  }
});

test('0067 applies least privilege RLS and forward-fixes Step 1 activation semantics', () => {
  const sql = migration(2);
  assert.match(sql, /enable row level security/u);
  assert.match(sql, /has_company_access/u);
  assert.match(sql, /revoke all on[\s\S]*company_bank_details[\s\S]*authenticated/u);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/u);
  assert.match(sql, /create or replace function public\.assign_pro_to_company/u);
  assert.match(sql, /create or replace function public\.reassign_company_pro/u);
  assert.match(sql, /company\.status = 'onboarding'[\s\S]*tenant[\s\S]*status = 'pending'/u);
  assert.match(sql, /company\.status in \('active', 'renewal_due', 'renewal_overdue'\)/u);
});
