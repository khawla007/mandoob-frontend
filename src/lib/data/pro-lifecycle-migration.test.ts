import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPaths = [
  'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql',
  'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql',
  'supabase/migrations/20260821102000_0070_pro_lifecycle_security_reconciliation.sql',
] as const;

function migration(index: number): string {
  return readFileSync(join(process.cwd(), migrationPaths[index]!), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

test('Step 3 uses the exact forward-only migration catalog', () => {
  for (const path of migrationPaths)
    assert.equal(existsSync(join(process.cwd(), path)), true, path);
});

test('0068 defines normalized lifecycle, evidence, decision, receipt, term, and link tables', () => {
  const sql = migration(0);
  for (const table of [
    'pro_credentials',
    'pro_credential_evidence',
    'pro_credential_decisions',
    'pro_credential_operations',
    'pro_commercial_terms',
    'pro_commercial_term_events',
    'pro_assignment_term_links',
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, 'u'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table}`, 'u'));
  }
  for (const state of [
    'draft',
    'submitted',
    'under_review',
    'verified',
    'rejected',
    'expired',
    'revoked',
  ]) {
    assert.match(sql, new RegExp(`'${state}'`, 'u'));
  }
  assert.match(sql, /where state in \('draft', 'submitted', 'under_review'\)/u);
  assert.match(sql, /where state = 'verified'/u);
  assert.match(sql, /exclude using gist/u);
  assert.match(sql, /foreign key \(pro_profile_id, credential_id\)/u);
  assert.match(sql, /legacy_unmasked/u);
  assert.match(sql, /license_no_encrypted/u);
  assert.match(sql, /identifier_hash is null/u);
  assert.match(sql, /identifier_last4 is null/u);
});

test('0069 defines fixed-path service workflows, eligibility, timeline, and expiry job', () => {
  const sql = migration(1);
  for (const fn of [
    'create_pro_credential_draft',
    'save_pro_credential_draft',
    'register_pro_credential_evidence',
    'remove_pro_credential_evidence',
    'submit_pro_credential',
    'begin_pro_credential_review',
    'verify_pro_credential',
    'reject_pro_credential',
    'revoke_pro_credential',
    'create_pro_credential_replacement',
    'create_pro_commercial_term_draft',
    'activate_pro_commercial_term',
    'end_pro_commercial_term',
    'evaluate_pro_assignment_eligibility',
    'read_pro_lifecycle_timeline',
    'materialize_expired_pro_credentials',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`${fn}[\\s\\S]*set search_path = ''`, 'u'));
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn}`, 'u'));
  }
  assert.match(sql, /p_expected_version bigint/u);
  assert.match(sql, /p_operation_id uuid/u);
  assert.match(sql, /operation_reused/u);
  assert.match(sql, /stale_credential_version/u);
  assert.match(sql, /for update skip locked/u);
  assert.match(sql, /45 2 \* \* \*/u);
  assert.match(sql, /created_at < pg_catalog\.now\(\) - interval '90 days'/u);
  for (const protectedKey of [
    'identifier_ciphertext',
    'identifier_hash',
    'storage_path',
    'sha256',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`jsonb_build_object\\([^;]*'${protectedKey}'`, 'u'));
  }
});

test('0070 applies final least privilege, live access, term linkage, and legacy removal', () => {
  const sql = migration(2);
  assert.match(sql, /enable row level security/u);
  assert.match(sql, /owner to postgres/u);
  assert.match(sql, /grant execute on function[\s\S]*to service_role/u);
  assert.match(sql, /create or replace function public\.has_company_access/u);
  assert.match(sql, /create or replace function public\.assign_pro_to_company/u);
  assert.match(sql, /create or replace function public\.reassign_company_pro/u);
  assert.match(sql, /pro_assignment_term_links/u);
  assert.match(sql, /timezone\('asia\/dubai', pg_catalog\.now\(\)\)::date/u);
  for (const column of [
    'license_no_encrypted',
    'credentials_verified',
    'verified_at',
    'verified_by_profile_id',
  ]) {
    assert.match(sql, new RegExp(`drop column ${column}`, 'u'));
  }
});
