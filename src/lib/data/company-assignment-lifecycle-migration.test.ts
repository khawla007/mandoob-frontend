import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath =
  'supabase/migrations/20260822170000_0078_company_assignment_lifecycle_integration.sql';
const fixturePath = 'supabase/tests/company_assignment_lifecycle.sql';
const forwardFixPath =
  'supabase/migrations/20260822180000_0079_company_assignment_integration_fixes.sql';
const runnerPath = 'supabase/tests/run_company_assignment_concurrency.sh';

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

test('0079 defines one replacement-aware adapter and authoritative mutation identities', () => {
  const sql = normalized(forwardFixPath);
  assert.match(sql, /function public\.evaluate_company_assignment_eligibility/u);
  assert.match(sql, /p_expected_assignment_id uuid/u);
  assert.match(
    sql,
    /list_eligible_pros_for_company[\s\S]*evaluate_company_assignment_eligibility/u,
  );
  assert.match(
    sql,
    /read_current_company_assignment_summary[\s\S]*evaluate_company_assignment_eligibility/u,
  );
  assert.match(sql, /function public\.release_company_pro_with_context/u);
  assert.match(
    sql,
    /v_result := public\.assign_pro_to_company[\s\S]*where id = \(v_result ->> 'assignmentid'\)::uuid/u,
  );
  assert.match(
    sql,
    /v_assignment_id := public\.release_company_pro[\s\S]*where id = v_assignment_id/u,
  );
  assert.match(sql, /'proprofileid'/u);
  assert.match(sql, /'previousproprofileid'/u);
  assert.match(sql, /security definer set search_path = ''/u);
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
    'reassign_term_link_rollback',
    'reassign_audit_rollback',
    'current_candidate_parity',
    'replacement_candidate_parity',
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

test('concurrency gate has deterministic setup and bounded portable orchestration', () => {
  const runner = readFileSync(join(process.cwd(), runnerPath), 'utf8');
  const setup = normalized('supabase/tests/company_assignment_concurrency_setup.sql');
  assert.match(runner, /^#!\/usr\/bin\/env bash/u);
  assert.match(runner, /set -euo pipefail/u);
  assert.match(runner, /timeout 120s/u);
  for (const name of ['one-pro', 'one-company', 'release-assign', 'swap-reassign'])
    assert.match(runner, new RegExp(name, 'u'));
  assert.match(setup, /assignment_concurrency_ready/u);
  for (const fixture of [
    'company_assignment_concurrency_session_b.sql',
    'company_assignment_swap_reassign_session_b.sql',
  ]) {
    const sql = normalized(`supabase/tests/${fixture}`);
    assert.match(sql, /expected_error/u, fixture);
    assert.match(sql, /no_concurrency_failure/u, fixture);
    assert.match(sql, /pro_assignment_term_links/u, fixture);
  }
  const oneToOne = normalized('supabase/tests/company_assignment_concurrency_session_b.sql');
  assert.match(oneToOne, /one_winner/u);
  assert.match(oneToOne, /immutable_history/u);
  const release = normalized('supabase/tests/company_assignment_release_assign_session_b.sql');
  assert.match(release, /expected_success/u);
  assert.match(release, /pro_assignment_term_links/u);
  assert.match(release, /status = 'released'/u);
  assert.match(release, /immutable_history/u);
  const swap = normalized('supabase/tests/company_assignment_swap_reassign_session_b.sql');
  assert.match(swap, /immutable_history/u);
});
