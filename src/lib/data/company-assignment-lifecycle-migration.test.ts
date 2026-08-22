import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260822170000_0078_company_assignment_lifecycle_integration.sql';
const fixturePath = 'supabase/tests/company_assignment_lifecycle.sql';

function normalized(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8').replace(/\s+/gu, ' ').toLowerCase();
}

test('0078 makes selector and current detail use the authoritative company-aware evaluator', () => {
  assert.equal(existsSync(join(process.cwd(), migrationPath)), true);
  const sql = normalized(migrationPath);
  assert.match(sql, /function public\.list_eligible_pros_for_company/u);
  assert.match(sql, /evaluate_pro_assignment_eligibility\(profile\.id, p_company_id\)/u);
  assert.doesNotMatch(sql, /and \(eligibility\.value ->> 'eligible'\)::boolean/u);
  assert.match(sql, /function public\.read_current_company_assignment_summary/u);
  assert.match(
    sql,
    /evaluate_pro_assignment_eligibility\(\s*v_assignment\.pro_profile_id, p_company_id\s*\)/u,
  );
  assert.match(sql, /'operationalaccess', case/u);
  assert.match(sql, /'operationalaccesscodes'/u);
  assert.match(sql, /security definer set search_path = ''/u);
  assert.match(
    sql,
    /grant execute on function public\.read_current_company_assignment_summary\(uuid, uuid\) to service_role/u,
  );
  assert.doesNotMatch(sql, /to authenticated/u);
});

test('assignment lifecycle fixture covers eligibility, replay, rollback, races, and tenant states', () => {
  assert.equal(existsSync(join(process.cwd(), fixturePath)), true);
  const sql = normalized(fixturePath);
  for (const marker of [
    'pro_account_inactive',
    'pro_credential_missing',
    'pro_credential_draft',
    'pro_credential_submitted',
    'pro_credential_under_review',
    'pro_credential_rejected',
    'pro_credential_expired',
    'pro_credential_revoked',
    'pro_already_assigned',
    'pricing_terms_missing',
    'compensation_terms_missing',
    'company_inactive',
    'company_already_assigned',
    'selector_detail_parity',
    'verified_unexpired_missing_terms',
    'revoked_current_assignment_blocked',
    'expired_current_assignment_blocked',
    'stale_expected_assignment',
    'release_replay',
    'reassign_replay',
    'term_link_rollback',
    'audit_rollback',
    'onboarding_company_remains_pending',
    'active_company_remains_active',
    'released_pro_later_assignment',
  ])
    assert.match(sql, new RegExp(marker, 'u'), marker);

  for (const fixture of [
    'company_assignment_concurrency_session_a.sql',
    'company_assignment_concurrency_session_b.sql',
    'company_assignment_release_assign_session_a.sql',
    'company_assignment_release_assign_session_b.sql',
    'company_assignment_swap_reassign_session_a.sql',
    'company_assignment_swap_reassign_session_b.sql',
  ])
    assert.equal(existsSync(join(process.cwd(), 'supabase/tests', fixture)), true, fixture);
});
