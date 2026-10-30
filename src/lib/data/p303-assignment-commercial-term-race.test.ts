import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const harnessPath = 'supabase/tests/p303-combined-assignment-commercial-term-race.mjs';
const standaloneDropPattern =
  /\bdrop\s+(?:database|schema|table|function|procedure|trigger|type|extension|role|owned)\b/iu;

test('standalone DROP guard is context-independent', () => {
  assert.match("sql('DROP SCHEMA public')", standaloneDropPattern);
});

test('checked-in assignment/commercial-term race harness has the final-schema safety contract', () => {
  assert.equal(existsSync(harnessPath), true, `${harnessPath} must be checked in`);
  const source = readFileSync(harnessPath, 'utf8');

  assert.match(source, /supabase_db_mandoob-p303-combined-j3xcqw/u);
  assert.match(source, /randomUUID\(\)/u);
  assert.match(source, /function sqlLiteral/u);
  assert.match(source, /MAX_WORKER_OUTPUT/u);
  assert.match(source, /statement_timeout/u);
  assert.match(source, /lock_timeout/u);
  assert.match(source, /idle_in_transaction_session_timeout/u);
  assert.match(source, /pg_terminate_backend/u);
  assert.match(source, /pg_try_advisory_lock/u);
  assert.match(source, /set idle_session_timeout='0'/u);
  assert.match(source, /set idle_in_transaction_session_timeout='0'/u);
  assert.match(source, /\{ endInput: false, timeoutMs: null \}/u);
  assert.match(source, /if \(timeoutMs !== null\) \{\s*timer = setTimeout/u);
  assert.match(source, /LOCK_ACQUIRE_READY_TIMEOUT_MS/u);
  assert.match(source, /LOCK_RELEASE_CLOSE_TIMEOUT_MS/u);
  assert.match(source, /function withTimeout/u);
  assert.match(source, /function verifyAndTerminateLockBackend/u);
  assert.match(source, /function terminateTimedOutLockSession/u);
  assert.match(
    source,
    /function terminateTimedOutLockSession[\s\S]*try\s*\{[\s\S]*verifyAndTerminateLockBackend[\s\S]*catch \(verificationError\)[\s\S]*new AggregateError\(\s*\[phaseError, verificationError\][\s\S]*finally\s*\{\s*session\.child\.kill\(\);\s*\}/u,
  );
  assert.ok((source.match(/terminateTimedOutLockSession\(/gu) ?? []).length >= 4);
  assert.match(source, /application_name=\$\{sqlLiteral\(applicationName\)\}/u);
  assert.match(source, /P303_COMBINED_ASSIGNMENT_TERM_SIMULATE_LOCK_ACQUIRE_TIMEOUT/u);
  assert.match(source, /await withTimeout\(\s*Promise\.all\(\[session\.backendPid/u);
  assert.match(source, /session\.child\.stdin\.write\(`rollback;/u);
  assert.match(
    source,
    /await withTimeout\(\s*session\.completion,\s*LOCK_RELEASE_CLOSE_TIMEOUT_MS/u,
  );
  assert.doesNotMatch(source, /finally\s*\{[^}]*terminateBackend\(backendPid\)/u);

  assert.match(source, /P303_COMBINED_ASSIGNMENT_TERM_CLEANUP_OWNER_TOKEN/u);
  assert.match(source, /Cleanup owner token must be 12 lowercase hex characters/u);
  assert.match(source, /sanitized_result ->> 'runToken'/u);
  assert.match(source, /CLEANUP_OWNERSHIP_MISMATCH/u);
  assert.match(source, /for update;/u);
  assert.match(source, /function printRecoveryInstructions/u);
  assert.match(source, /P303_ASSIGNMENT_TERM_RECOVERY_OWNER_TOKEN=/u);
  assert.match(source, /function ownershipMarkerMatches/u);
  assert.match(source, /P303_COMBINED_ASSIGNMENT_TERM_SIMULATE_SETUP_AMBIGUITY/u);
  assert.match(
    source,
    /printRecoveryInstructions\(\);\s*try\s*\{\s*setup\(\);\s*cleanupOwnedFixtures = true;\s*\}\s*catch[^{]*\{[\s\S]*ownershipMarkerMatches\(\)[\s\S]*cleanupOwnedFixtures = true;[\s\S]*throw setupError;\s*\}\s*assertOwnershipMarker\(\);\s*assertFixturePreflight\(\);/u,
  );
  assert.match(source, /Reserved fixture collision: refusing setup and cleanup/u);

  assert.match(source, /function snapshotCleanupTriggerStates/u);
  assert.match(source, /function assertExpectedCleanupTriggerStates/u);
  assert.match(source, /function restoreCleanupTriggerSql/u);
  assert.match(source, /event_job_attempts_immutable/u);
  assert.match(source, /event_replay_requests_immutable/u);
  assert.match(source, /domain_events_immutable/u);
  assert.match(
    source,
    /cleanupTriggerStates = snapshotCleanupTriggerStates\(\);\s*assertExpectedCleanupTriggerStates\(cleanupTriggerStates\);[\s\S]*setup\(\)/u,
  );
  assert.match(source, /assertCleanupTriggerStates\(\s*cleanupTriggerStates/u);

  assert.match(source, /assignment-wins-then-term-ends/u);
  assert.match(source, /term-end-wins-assignment-rejected/u);
  assert.match(source, /public\.assign_pro_to_company\(/u);
  assert.match(source, /public\.end_pro_commercial_term\(/u);
  assert.match(source, /PRO_PRICING_NOT_CONFIGURED/u);
  assert.match(source, /pg_blocking_pids\(b\.pid\)/u);
  assert.match(source, /active assignment snapshots the pricing term before its later end/u);
  assert.match(source, /end-first assignment loser left no assignment\/audit fragments/u);
  assert.match(source, /winner replay changed result/u);
  assert.match(source, /exactly one job for every fixture event/u);
  assert.match(source, /Full assignment-first final state changed/u);
  assert.match(source, /Full term-first final state changed/u);
  assert.match(source, /Assignment audit content changed/u);
  assert.match(source, /Commercial term side-effect content changed/u);
  assert.match(source, /P3\.10 event\/job content changed/u);
  assert.match(source, /Both schedules are not fully legal before contention/u);
  assert.match(source, /Full parent-child fixture chronology is inconsistent/u);
  assert.match(source, /raw_app_meta_data/u);
  assert.match(source, /internal\.lifecycle\.projection/u);
  assert.match(source, /jsonb_build_object\(\s*'assignment_id'/u);
  assert.match(source, /jsonb_build_object\(\s*'subject_id'/u);
  assert.match(source, /entity_kind='commercial_term'/u);
  assert.match(source, /pg_catalog\.timezone\('Asia\/Dubai',pg_catalog\.now\(\)\)::date/u);
  assert.doesNotMatch(source, /const dubaiToday = sql/u);
  assert.doesNotMatch(source, /endOperationIds/u);
  assert.doesNotMatch(source, standaloneDropPattern);
  assert.doesNotMatch(source, /\bdropdb\b/iu);
  assert.doesNotMatch(source, /\bsupabase\s+(?:db\s+(?:reset|push)|migration\s+up)\b/iu);
  assert.doesNotMatch(
    source,
    /\b(?:prisma|dbmate|atlas)\b[^\n;]*(?:\breset\b|\bmigrate\b|\bpush\b|migration\s+up)/iu,
  );
  assert.doesNotMatch(source, /docker\s+(?:rm|compose\s+down)/iu);

  for (const table of [
    'pro_company_assignments',
    'pro_assignment_term_links',
    'pro_commercial_terms',
    'pro_commercial_term_events',
    'tenant_audit_log',
    'auth_events',
    'pro_lifecycle_operation_receipts',
    'domain_events',
    'event_jobs',
  ]) {
    assert.match(source, new RegExp(`public\\.${table}`, 'u'));
  }
  assert.match(source, /delete from public\.event_job_attempts where job_id in/u);
  assert.match(source, /delete from public\.event_replay_requests where source_job_id in/u);
  for (const predicate of [
    'assignmentPredicate',
    'termPredicate',
    'termEventPredicate',
    'tenantAuditPredicate',
    'authEventPredicate',
    'receiptPredicate',
  ]) {
    assert.match(source, new RegExp(`function ${predicate}\\(\\)`, 'u'));
    assert.ok((source.match(new RegExp(`${predicate}\\(\\)`, 'gu')) ?? []).length >= 3);
  }
  assert.match(source, /fixtureCount\(\)/u);
  assert.match(source, /Exact synthetic fixture cleanup/u);
});
