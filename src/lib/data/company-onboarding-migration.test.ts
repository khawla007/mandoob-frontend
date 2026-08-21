import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  assert.doesNotMatch(sql, /establishment_card_no_encrypted[\s\S]*return/u);
  assert.doesNotMatch(sql, /iban_encrypted[\s\S]*return/u);
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
