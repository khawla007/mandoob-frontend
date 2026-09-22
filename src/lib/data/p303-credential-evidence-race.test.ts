import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const harnessPath = 'supabase/tests/p303-combined-credential-evidence-race.mjs';

test('checked-in credential decision/evidence race harness has the final-schema safety contract', () => {
  assert.equal(existsSync(harnessPath), true, `${harnessPath} must be checked in`);
  const source = readFileSync(harnessPath, 'utf8');

  assert.match(source, /supabase_db_mandoob-p303-combined-j3xcqw/u);
  assert.match(source, /randomUUID\(\)/u);
  assert.match(source, /pg_try_advisory_lock/u);
  assert.match(source, /Reserved fixture collision: refusing setup and cleanup/u);
  assert.match(source, /statement_timeout/u);
  assert.match(source, /lock_timeout/u);
  assert.match(source, /idle_in_transaction_session_timeout/u);
  assert.match(source, /pg_terminate_backend/u);
  assert.match(source, /MAX_WORKER_OUTPUT/u);
  assert.match(source, /function sqlLiteral/u);
  assert.match(source, /CLEANUP_OWNERSHIP_MISMATCH/u);
  assert.match(source, /sanitized_result ->> 'runToken'/u);
  assert.match(source, /for update;/u);
  assert.match(source, /setup\(\);\s*cleanupOwnedFixtures = true;/u);
  assert.doesNotMatch(source, /P303_COMBINED_CLEANUP_ONLY/u);
  assert.match(source, /P303_COMBINED_CLEANUP_OWNER_TOKEN/u);
  assert.match(source, /Cleanup owner token must be 12 lowercase hex characters/u);

  assert.match(source, /set idle_session_timeout='0'/u);
  assert.match(source, /set idle_in_transaction_session_timeout='0'/u);
  assert.doesNotMatch(source, /timeoutMs: 600_000/u);
  assert.match(source, /\{ endInput: false, timeoutMs: null \}/u);
  assert.match(source, /if \(timeoutMs !== null\) \{\s*timer = setTimeout/u);
  assert.match(source, /terminateBackend\(backendPid\)/u);

  assert.match(source, /credential-decision-wins/u);
  assert.match(source, /credential-evidence-wins/u);
  assert.match(source, /pg_blocking_pids\(b\.pid\)/u);
  assert.match(source, /public\.submit_pro_credential\(/u);
  assert.match(source, /public\.finalize_pro_credential_evidence_upload\(/u);
  assert.match(source, /STALE_CREDENTIAL_VERSION/u);
  assert.doesNotMatch(source, /set lease_expires_at\s*=\s*pg_catalog\.now\(\)-/u);
  assert.doesNotMatch(source, /prepareUploadRpc/u);
  assert.match(source, /insert into public\.pro_credential_evidence_upload_reservations/u);
  assert.match(source, /now\(\)-interval '21 minutes' as scan_completed_at/u);
  assert.match(source, /now\(\)-interval '20 minutes' as created_at/u);
  assert.match(source, /now\(\)-interval '5 minutes' as lease_expires_at/u);
  assert.match(source, /now\(\)-interval '35 minutes'/u);
  assert.match(source, /now\(\)-interval '31 minutes'/u);
  assert.match(source, /Full parent-child fixture chronology is inconsistent/u);

  for (const table of [
    'pro_credentials',
    'pro_credential_evidence',
    'pro_credential_decisions',
    'auth_events',
    'pro_lifecycle_operation_receipts',
    'domain_events',
    'event_jobs',
  ]) {
    assert.match(source, new RegExp(`public\\.${table}`, 'u'));
  }
  assert.match(source, /exactly one job for every fixture event/u);
  assert.match(source, /winner replay changed result/u);
  assert.match(source, /Evidence winner replay changed evidence identity\/cardinality/u);
  assert.match(source, /delete from public\.event_job_attempts where job_id in/u);
  assert.match(source, /delete from public\.event_replay_requests where source_job_id in/u);
  for (const predicate of [
    'credentialPredicate',
    'evidencePredicate',
    'decisionPredicate',
    'receiptPredicate',
    'reservationPredicate',
    'authEventPredicate',
  ]) {
    assert.match(source, new RegExp(`function ${predicate}\\(\\)`, 'u'));
    assert.ok((source.match(new RegExp(`${predicate}\\(\\)`, 'gu')) ?? []).length >= 3);
  }
  assert.match(source, /fixtureCount\(\)/u);
  assert.match(source, /Exact synthetic fixture cleanup/u);
});
