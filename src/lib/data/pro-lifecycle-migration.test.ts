import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPaths = [
  'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql',
  'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql',
  'supabase/migrations/20260821102000_0070_pro_lifecycle_security_reconciliation.sql',
  'supabase/migrations/20260822100000_0071_pro_credential_evidence_removal_protocol.sql',
  'supabase/migrations/20260822110000_0072_pro_evidence_removal_recovery.sql',
  'supabase/migrations/20260822120000_0073_pro_evidence_removal_fenced_recovery.sql',
] as const;
const credentialHistoryMigrationPath =
  'supabase/migrations/20260826101000_0086_pro_credential_history_integrity.sql';
const profileSelfUpdateMigrationPath =
  'supabase/migrations/20260826100000_0085_pro_profile_self_update_columns.sql';
const commercialTermIntegrityMigrationPath =
  'supabase/migrations/20260826102000_0086b_pro_commercial_term_integrity.sql';
const evidenceUploadReservationMigrationPath =
  'supabase/migrations/20260826103000_0086c_pro_credential_evidence_upload_reservations.sql';
const evidenceUploadReservationSqlTestPath =
  'supabase/tests/pro_credential_evidence_upload_reservations.sql';
const evidenceUploadCleanupMigrationPath =
  'supabase/migrations/20260826104000_0086d_pro_credential_evidence_upload_cleanup.sql';
const evidenceUploadCleanupRunbookPath = 'docs/ops/pro-credential-evidence-upload-cleanup.md';
const evidenceUploadCleanupSqlTestPath =
  'supabase/tests/pro_credential_evidence_upload_cleanup.sql';
const evidenceUploadQuiescenceMigrationPath =
  'supabase/migrations/20260826105000_0086e_pro_evidence_upload_quiescence.sql';
const evidenceTerminalReplayMigrationPath =
  'supabase/migrations/20260826106000_0086f_pro_evidence_terminal_replay_mutex.sql';
const evidenceTerminalReplaySqlTestPath = 'supabase/tests/pro_evidence_terminal_replay_mutex.sql';
const evidenceReplayRetentionMigrationPath =
  'supabase/migrations/20260826107000_0086g_pro_evidence_replay_retention.sql';
const evidenceTombstoneRetentionSqlTestPath = 'supabase/tests/pro_evidence_tombstone_retention.sql';

function migration(index: number): string {
  return readFileSync(join(process.cwd(), migrationPaths[index]!), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

test('0086c installs a private fenced credential evidence upload protocol', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadReservationMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceUploadReservationMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  assert.match(sql, /create table public\.pro_credential_evidence_upload_reservations/u);
  assert.match(sql, /unique.*credential_id.*where.*status = 'prepared'/u);
  assert.match(sql, /function public\.prepare_pro_credential_evidence_upload/u);
  assert.match(sql, /function public\.finalize_pro_credential_evidence_upload/u);
  assert.match(sql, /function public\.guard_pro_credential_evidence_upload_reservation/u);
  assert.match(sql, /function public\.guard_prepared_pro_credential_evidence_upload/u);
  assert.match(sql, /app\.pro_evidence_upload_finalize/u);
  assert.match(sql, /security definer set search_path = ''/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /lease_expires_at/u);
  assert.match(sql, /evidence_upload_in_progress/u);
  assert.match(sql, /evidence_upload_reservation_lost/u);
  assert.match(sql, /pro_lifecycle_replay_result/u);
  assert.match(sql, /write_pro_lifecycle_audit/u);
  assert.match(sql, /store_pro_lifecycle_receipt/u);
  assert.match(sql, /not exists[\s\S]*from public\.pro_credential_evidence/u);
  assert.match(
    sql,
    /alter function public\.prepare_pro_credential_evidence_upload[\s\S]*owner to postgres/u,
  );
  assert.match(
    sql,
    /alter function public\.finalize_pro_credential_evidence_upload[\s\S]*owner to postgres/u,
  );
  assert.match(
    sql,
    /revoke all on table public\.pro_credential_evidence_upload_reservations from public, anon, authenticated, service_role/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.prepare_pro_credential_evidence_upload[\s\S]*to service_role/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.finalize_pro_credential_evidence_upload[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/u);
});

test('credential evidence upload SQL regression covers replay, fencing and cleanup races', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadReservationSqlTestPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceUploadReservationSqlTestPath), 'utf8');
  for (const marker of [
    'STALE_PREFLIGHT_ACCEPTED',
    'PAYLOAD_MISMATCH_ACCEPTED',
    'SAME_OPERATION_DID_NOT_RESUME',
    'DIFFERENT_OPERATION_NOT_FENCED',
    'CONCURRENT_CREDENTIAL_MUTATION_NOT_FENCED',
    'EXPIRED_RESERVATION_NOT_RECOVERED',
    'FINALIZATION_REPLAY_CHANGED',
    'CLEANUP_REFERENCED_OBJECT',
    'FINALIZATION_NOT_ATOMIC',
  ])
    assert.match(sql, new RegExp(marker, 'u'));
});

test('0086d installs leased cleanup and scheduled finalized-tombstone retention', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadCleanupMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceUploadCleanupMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  for (const fn of [
    'claim_pro_credential_evidence_upload_cleanup',
    'finalize_pro_credential_evidence_upload_cleanup',
    'cleanup_finalized_pro_credential_evidence_upload_reservations',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}[\\s\\S]*set search_path = ''`, 'u'));
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
  }
  assert.match(sql, /for update skip locked/u);
  assert.match(sql, /p_limit not between 1 and 25/u);
  assert.match(sql, /status = 'cleanup'[\s\S]*cleanup_after <= pg_catalog\.now\(\)/u);
  assert.match(sql, /status in \('prepared', 'cleanup', 'recovering', 'finalized'\)/u);
  assert.match(sql, /not exists[\s\S]*from public\.pro_credential_evidence/u);
  assert.match(sql, /interval '30 days'/u);
  assert.match(sql, /cron\.schedule[\s\S]*pro-evidence-upload-tombstone-retention/u);
  assert.doesNotMatch(sql, /delete from storage\.objects/u);
  assert.match(
    sql,
    /grant execute on function public\.claim_pro_credential_evidence_upload_cleanup[\s\S]*to service_role/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.finalize_pro_credential_evidence_upload_cleanup[\s\S]*to service_role/u,
  );
  assert.doesNotMatch(sql, /grant execute[\s\S]*to authenticated/u);
  assert.match(
    sql,
    /revoke all on function public\.register_pro_credential_evidence[\s\S]*from service_role/u,
  );
});

test('credential evidence upload cleanup runbook documents external scheduling and retry safety', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadCleanupRunbookPath)), true);
  const docs = readFileSync(join(process.cwd(), evidenceUploadCleanupRunbookPath), 'utf8');
  assert.match(docs, /\/api\/v1\/cron\/cleanup-pro-credential-evidence-uploads/u);
  assert.match(docs, /x-cron-secret/u);
  assert.match(docs, /CRON_SECRET/u);
  assert.match(docs, /every (?:five|5) minutes/iu);
  assert.match(docs, /retry/iu);
  assert.match(docs, /120 seconds/iu);
  assert.match(docs, /five-minute quiescence/iu);
  assert.match(docs, /two erases/iu);
  assert.match(docs, /cleaned tombstone/iu);
  assert.match(docs, /91\s+days/iu);
  assert.match(docs, /90-day operation-receipt window/iu);
});

test('credential evidence upload cleanup SQL fixture covers claim, reference race and retention', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadCleanupSqlTestPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceUploadCleanupSqlTestPath), 'utf8');
  for (const marker of [
    'EXPIRED_UPLOAD_NOT_CLAIMED',
    'FIRST_ERASE_NOT_QUIESCING',
    'QUIESCENCE_SECOND_PASS_SKIPPED',
    'SECOND_ERASE_NOT_RETAINED',
    'REFERENCED_CLEANUP_WAS_CLAIMED',
    'REFERENCE_RACE_DELETED_RESERVATION',
    'FINALIZED_RETENTION_INVALID',
    'HISTORICAL_REGISTER_STILL_EXECUTABLE',
  ])
    assert.match(sql, new RegExp(marker, 'u'));
});

test('credential evidence upload cleanup has lock-controlled two-session race fixtures', () => {
  const names = [
    'pro_evidence_upload_cleanup_concurrency_setup.sql',
    'pro_evidence_upload_cleanup_session_a.sql',
    'pro_evidence_upload_cleanup_session_b.sql',
    'pro_evidence_upload_cleanup_concurrency_teardown.sql',
  ];
  const sources = names.map((name) => {
    const path = join(process.cwd(), 'supabase/tests', name);
    assert.equal(existsSync(path), true, name);
    return readFileSync(path, 'utf8');
  });
  assert.match(sources[1]!, /pg_advisory_xact_lock\(69006, 1\)/u);
  assert.match(sources[2]!, /CLEANUP_CLAIMED_CONCURRENT_FINALIZATION/u);
  assert.match(sources[2]!, /NEW_OPERATION_FINALIZED_ALONGSIDE_OLD/u);
  assert.match(sources[2]!, /CONCURRENT_FINALIZATION_OUTCOME_UNSAFE/u);
});

test('0086e enforces two-pass quiescence and retained cleaned tombstones', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceUploadQuiescenceMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceUploadQuiescenceMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  assert.match(sql, /cleanup_passes/u);
  assert.match(sql, /create schema if not exists private authorization postgres/u);
  assert.match(sql, /revoke all on schema private from public, anon, authenticated, service_role/u);
  assert.match(
    sql,
    /revoke all on function private\.prepare_pro_credential_evidence_upload_0086d[\s\S]*from public, anon, authenticated, service_role/u,
  );
  assert.match(sql, /status in \('prepared', 'cleanup', 'recovering', 'finalized', 'cleaned'\)/u);
  assert.match(sql, /interval '5 minutes'/u);
  assert.match(sql, /status = 'cleanup'[\s\S]*cleanup_passes = 1/u);
  assert.match(sql, /status = 'cleaned'[\s\S]*cleanup_passes = 2/u);
  assert.match(sql, /status in \('finalized', 'cleaned'\)[\s\S]*interval '30 days'/u);
  assert.match(sql, /limit 1000[\s\S]*for update skip locked/u);
  const cleanupFinalize = sql.slice(
    sql.indexOf(
      'create or replace function public.finalize_pro_credential_evidence_upload_cleanup',
    ),
    sql.indexOf(
      'create or replace function public.cleanup_finalized_pro_credential_evidence_upload_reservations',
    ),
  );
  assert.doesNotMatch(
    cleanupFinalize,
    /delete from public\.pro_credential_evidence_upload_reservations/u,
  );
  assert.doesNotMatch(sql, /(?:delete|insert|update)[\s\S]*storage\.objects/u);
  for (const fn of [
    'prepare_pro_credential_evidence_upload',
    'prepare_pro_credential_evidence_removal',
    'finalize_pro_credential_evidence_upload_cleanup',
    'cleanup_finalized_pro_credential_evidence_upload_reservations',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}[\\s\\S]*set search_path = ''`, 'u'));
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
  }
});

test('0086e prepare RPCs mutually exclude active upload and removal reservations', () => {
  const sql = readFileSync(join(process.cwd(), evidenceUploadQuiescenceMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  const upload = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_upload'),
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_removal'),
  );
  const removal = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_removal'),
    sql.indexOf('create or replace function public.finalize_pro_credential_evidence_removal'),
  );
  assert.match(
    upload,
    /from public\.pro_credentials[\s\S]*for update[\s\S]*from public\.pro_credential_evidence_removals[\s\S]*status in \('prepared', 'recovering'\)/u,
  );
  assert.match(upload, /evidence_removal_in_progress/u);
  assert.match(
    removal,
    /from public\.pro_credentials[\s\S]*for update[\s\S]*from public\.pro_credential_evidence_upload_reservations[\s\S]*status in \('prepared', 'recovering'\)/u,
  );
  assert.match(removal, /evidence_upload_in_progress/u);
});

test('evidence protocol mutex uses lock-controlled fixtures in both directions', () => {
  for (const name of [
    'pro_evidence_protocol_mutex_setup.sql',
    'pro_evidence_protocol_mutex_upload_a.sql',
    'pro_evidence_protocol_mutex_removal_b.sql',
    'pro_evidence_protocol_mutex_removal_a.sql',
    'pro_evidence_protocol_mutex_upload_b.sql',
    'pro_evidence_protocol_mutex_resume.sql',
    'pro_evidence_protocol_mutex_teardown.sql',
  ]) {
    const path = join(process.cwd(), 'supabase/tests', name);
    assert.equal(existsSync(path), true, name);
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /(?:delete|insert|update)[\s\S]*storage\.objects/u);
  }
});

test('0086f authorizes exact terminal replay before opposing protocol mutexes', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceTerminalReplayMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceTerminalReplayMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  for (const fn of [
    'prepare_pro_credential_evidence_upload',
    'prepare_pro_credential_evidence_removal',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}[\\s\\S]*set search_path = ''`, 'u'));
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${fn}[\\s\\S]*from public, anon, authenticated`,
        'u',
      ),
    );
  }
  const upload = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_upload'),
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_removal'),
  );
  const removal = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_removal'),
    sql.indexOf('alter function public.prepare_pro_credential_evidence_upload'),
  );
  assert.match(
    upload,
    /assert_pro_lifecycle_actor[\s\S]*status = 'finalized'[\s\S]*return[\s\S]*from public\.pro_credential_evidence_removals/u,
  );
  assert.match(
    removal,
    /assert_pro_lifecycle_actor[\s\S]*status = 'complete'[\s\S]*return[\s\S]*from public\.pro_credential_evidence_upload_reservations/u,
  );
});

test('terminal evidence replay SQL covers both opposing protocols and denial cases', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceTerminalReplaySqlTestPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceTerminalReplaySqlTestPath), 'utf8');
  for (const marker of [
    'UPLOAD_TERMINAL_REPLAY_BLOCKED_BY_REMOVAL',
    'UPLOAD_TERMINAL_REPLAY_SCANNER_METADATA_CHANGED',
    'REMOVAL_TERMINAL_REPLAY_BLOCKED_BY_UPLOAD',
    'UPLOAD_TERMINAL_REPLAY_PAYLOAD_MISMATCH_ACCEPTED',
    'REMOVAL_TERMINAL_REPLAY_PAYLOAD_MISMATCH_ACCEPTED',
    'UPLOAD_TERMINAL_REPLAY_ACTOR_MISMATCH_ACCEPTED',
    'REMOVAL_TERMINAL_REPLAY_ACTOR_MISMATCH_ACCEPTED',
    'UPLOAD_TERMINAL_REPLAY_UNAUTHORIZED',
    'REMOVAL_TERMINAL_REPLAY_UNAUTHORIZED',
  ]) {
    assert.match(sql, new RegExp(marker, 'u'));
  }
  assert.doesNotMatch(sql, /(?:delete|insert|update)[\s\S]*storage\.objects/u);
});

test('0086g keeps logical upload replay stable and tombstones beyond receipt retention', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceReplayRetentionMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceReplayRetentionMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  const upload = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_upload'),
    sql.indexOf(
      'create or replace function public.guard_pro_credential_evidence_removal_reservation',
    ),
  );
  assert.match(upload, /v_terminal\.actor_id[\s\S]*v_terminal\.original_name_safe/u);
  assert.doesNotMatch(upload, /v_terminal\.scan_provider|v_terminal\.scan_completed_at/u);
  assert.match(
    sql,
    /status in \('finalized', 'cleaned'\)[\s\S]*interval '91 days'[\s\S]*limit 1000[\s\S]*for update skip locked/u,
  );
  assert.match(
    sql,
    /status = 'complete'[\s\S]*completed_at[\s\S]*status = 'cancelled'[\s\S]*cancelled_at[\s\S]*interval '91 days'[\s\S]*limit 1000[\s\S]*for update skip locked/u,
  );
  assert.match(sql, /pro-evidence-upload-tombstone-retention/u);
  assert.match(sql, /pro-evidence-removal-retention-cleanup/u);
  for (const fn of [
    'prepare_pro_credential_evidence_upload',
    'cleanup_finalized_pro_credential_evidence_upload_reservations',
    'cleanup_pro_credential_evidence_removals',
    'guard_pro_credential_evidence_removal_reservation',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}[\\s\\S]*set search_path = ''`, 'u'));
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
  }
});

test('evidence tombstone retention fixture covers receipt-window and expiry boundaries', () => {
  assert.equal(existsSync(join(process.cwd(), evidenceTombstoneRetentionSqlTestPath)), true);
  const sql = readFileSync(join(process.cwd(), evidenceTombstoneRetentionSqlTestPath), 'utf8');
  for (const marker of [
    'UPLOAD_TOMBSTONE_REMOVED_INSIDE_RECEIPT_WINDOW',
    'UPLOAD_TOMBSTONE_NOT_REMOVED_AFTER_RETENTION',
    'REMOVAL_TOMBSTONE_REMOVED_INSIDE_RECEIPT_WINDOW',
    'REMOVAL_TOMBSTONE_NOT_REMOVED_AFTER_RETENTION',
  ]) {
    assert.match(sql, new RegExp(marker, 'u'));
  }
  assert.match(sql, /90 days 12 hours/u);
  assert.match(sql, /92 days/u);
  assert.doesNotMatch(sql, /(?:delete|insert|update)[\s\S]*storage\.objects/u);
});

test('Step 3 uses the exact forward-only migration catalog', () => {
  assert.deepEqual(migrationPaths, [
    'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql',
    'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql',
    'supabase/migrations/20260821102000_0070_pro_lifecycle_security_reconciliation.sql',
    'supabase/migrations/20260822100000_0071_pro_credential_evidence_removal_protocol.sql',
    'supabase/migrations/20260822110000_0072_pro_evidence_removal_recovery.sql',
    'supabase/migrations/20260822120000_0073_pro_evidence_removal_fenced_recovery.sql',
  ]);
  assert.equal(existsSync(join(process.cwd(), migrationPaths[0])), true, migrationPaths[0]);
});

test('0073 fences every recovery as durable delete intent and supersedes cancellation', () => {
  const sql = migration(5);
  assert.match(sql, /add column recovery_operation_id uuid/u);
  assert.match(sql, /status in \('prepared', 'recovering', 'complete', 'cancelled'\)/u);
  assert.match(sql, /function public\.claim_pro_credential_evidence_removal_recovery/u);
  assert.match(sql, /function public\.finalize_pro_credential_evidence_removal_recovery/u);
  assert.match(sql, /security definer set search_path = ''/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /v_actor\.role not in \('admin', 'super_admin'\)/u);
  assert.match(sql, /v_actor\.status <> 'active'/u);
  assert.match(sql, /v_actor\.tenant_id is not null/u);
  assert.match(sql, /v_removal\.status not in \('prepared', 'recovering', 'cancelled'\)/u);
  assert.match(
    sql,
    /v_removal\.status = 'recovering'[\s\S]*lease_expires_at > pg_catalog\.now\(\)/u,
  );
  assert.match(sql, /set status = 'recovering'/u);
  assert.match(sql, /recovery_operation_id = p_recovery_operation_id/u);
  assert.match(sql, /evidence_removal_claim_lost/u);
  assert.match(sql, /credential_evidence_removal_recovered/u);
  assert.match(sql, /'originalactorid'/u);
  assert.match(sql, /'recoveryactorid'/u);
  assert.match(
    sql,
    /prepare_pro_credential_evidence_removal[\s\S]*v_removal\.status = 'recovering'[\s\S]*evidence_removal_in_progress/u,
  );
  assert.match(
    sql,
    /finalize_pro_credential_evidence_removal[\s\S]*v_removal\.status = 'recovering'[\s\S]*evidence_removal_in_progress/u,
  );
  assert.match(
    sql,
    /v_removal\.status = 'cancelled'[\s\S]*status in \('prepared', 'recovering'\)[\s\S]*evidence_removal_in_progress/u,
  );
  const prepare = sql.slice(
    sql.indexOf('create or replace function public.prepare_pro_credential_evidence_removal'),
    sql.indexOf('create or replace function public.finalize_pro_credential_evidence_removal'),
  );
  const resume = prepare.slice(prepare.indexOf("if v_removal.status = 'cancelled'"));
  assert.ok(
    resume.indexOf('where id = v_removal.credential_id') <
      resume.indexOf('select 1 from public.pro_credential_evidence_removals competing'),
    'cancelled resume locks the credential before checking active competitors',
  );
  const claim = sql.slice(
    sql.indexOf('create or replace function public.claim_pro_credential_evidence_removal_recovery'),
    sql.indexOf(
      'create or replace function public.finalize_pro_credential_evidence_removal_recovery',
    ),
  );
  assert.ok(
    claim.indexOf('where id = p_credential_id and pro_profile_id = p_pro_profile_id for update') <
      claim.indexOf('select 1 from public.pro_credential_evidence_removals competing'),
    'legacy cancellation claim locks the credential before checking active competitors',
  );
  assert.match(sql, /drop function public\.recover_pro_credential_evidence_removal\(uuid, uuid\)/u);
  assert.doesNotMatch(sql, /from storage\.objects/u);
  assert.doesNotMatch(sql, /credential_evidence_removal_cancelled/u);
  const cleanup = sql.slice(
    sql.indexOf('create or replace function public.cleanup_pro_credential_evidence_removals'),
    sql.indexOf('revoke all on function public.recover_pro_credential_evidence_removal'),
  );
  assert.match(cleanup, /where status = 'complete'/u);
  assert.doesNotMatch(cleanup, /cancelled|prepared|recovering/u);
  for (const fn of [
    'claim_pro_credential_evidence_removal_recovery',
    'finalize_pro_credential_evidence_removal_recovery',
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'u'),
    );
  }
  assert.doesNotMatch(sql, /to authenticated/u);
  assert.match(
    sql,
    /revoke all on table public\.pro_credential_evidence_removals from public, anon, authenticated, service_role/u,
  );
});

test('0072 adds bounded operator recovery and terminal retention without weakening reservations', () => {
  const sql = migration(4);
  assert.match(sql, /add column lease_expires_at timestamptz/u);
  assert.match(sql, /add column recovery_actor_id uuid/u);
  assert.match(sql, /status in \('prepared', 'complete', 'cancelled'\)/u);
  assert.match(sql, /function public\.recover_pro_credential_evidence_removal/u);
  assert.match(sql, /function public\.cleanup_pro_credential_evidence_removals/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /v_actor\.role not in \('admin', 'super_admin'\)/u);
  assert.match(sql, /v_actor\.status <> 'active'/u);
  assert.match(sql, /v_actor\.tenant_id is not null/u);
  assert.match(sql, /evidence_removal_lease_active/u);
  assert.match(sql, /from storage\.objects/u);
  assert.match(sql, /bucket_id = 'tenant-documents'/u);
  assert.match(sql, /name = v_removal\.storage_path/u);
  assert.match(sql, /status = 'cancelled'/u);
  assert.match(sql, /credential_evidence_removal_cancelled/u);
  assert.match(sql, /credential_evidence_removal_recovered/u);
  assert.match(sql, /app\.pro_evidence_recovery/u);
  assert.match(sql, /app\.pro_evidence_resume/u);
  assert.match(
    sql,
    /guard_prepared_pro_evidence_removal[\s\S]*app\.pro_evidence_finalize[\s\S]*app\.pro_evidence_recovery/u,
  );
  assert.match(
    sql,
    /guard_pro_evidence_delete[\s\S]*app\.pro_evidence_finalize[\s\S]*app\.pro_evidence_recovery/u,
  );
  assert.match(
    sql,
    /v_removal\.status = 'cancelled'[\s\S]*set status = 'prepared'[\s\S]*lease_expires_at = pg_catalog\.now\(\) \+ interval '15 minutes'/u,
  );
  const recovery = sql.slice(
    sql.indexOf('create or replace function public.recover_pro_credential_evidence_removal'),
    sql.indexOf('create or replace function public.cleanup_pro_credential_evidence_removals'),
  );
  assert.ok(
    recovery.indexOf('select * into v_actor from public.profiles where id = p_actor_id;') <
      recovery.indexOf('pg_advisory_xact_lock'),
    'unauthorized callers are rejected before reservation lookup',
  );
  assert.ok(
    recovery.indexOf('pg_advisory_xact_lock') <
      recovery.indexOf(
        'select * into v_actor from public.profiles where id = p_actor_id for update',
      ),
    'operator row lock follows the shared evidence advisory lock order',
  );
  assert.doesNotMatch(recovery, /jsonb_build_object\([^;]*storage/u);
  const cleanup = sql.slice(
    sql.indexOf('create or replace function public.cleanup_pro_credential_evidence_removals'),
    sql.indexOf('alter function public.cleanup_pro_credential_evidence_removals'),
  );
  assert.match(cleanup, /status in \('complete', 'cancelled'\)/u);
  assert.match(cleanup, /interval '30 days'/u);
  assert.doesNotMatch(cleanup, /status = 'prepared'/u);
  assert.match(sql, /pro-evidence-removal-retention-cleanup/u);
  assert.match(
    sql,
    /revoke all on table public\.pro_credential_evidence_removals from public, anon, authenticated, service_role/u,
  );
  for (const fn of [
    'recover_pro_credential_evidence_removal',
    'cleanup_pro_credential_evidence_removals',
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${fn}[\\s\\S]*owner to postgres`, 'u'));
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*to service_role`, 'u'),
    );
  }
});

test('0071 makes evidence removal a private durable prepare/finalize protocol', () => {
  const sql = migration(3);
  assert.match(sql, /create table public\.pro_credential_evidence_removals/u);
  assert.match(sql, /unique \(credential_id, operation_id\)/u);
  assert.match(sql, /where status = 'prepared'/u);
  assert.match(sql, /function public\.prepare_pro_credential_evidence_removal/u);
  assert.match(sql, /function public\.finalize_pro_credential_evidence_removal/u);
  assert.match(sql, /pg_advisory_xact_lock/u);
  assert.match(sql, /for update/u);
  assert.match(sql, /evidence_removal_in_progress/u);
  assert.match(
    sql,
    /prepare_pro_credential_evidence_removal[\s\S]*exception when sqlstate 'p0001' then if sqlerrm = 'forbidden' then raise exception using errcode = 'p0001', message = 'not_found'/u,
  );
  assert.match(
    sql,
    /finalize_pro_credential_evidence_removal[\s\S]*assert_pro_lifecycle_actor\(p_actor_id, v_removal\.pro_profile_id, false\)[\s\S]*exception when sqlstate 'p0001' then if sqlerrm = 'forbidden' then raise exception using errcode = 'p0001', message = 'not_found'/u,
  );
  assert.equal(
    [
      ...sql.matchAll(
        /begin perform public\.(?:authorize|assert)_pro_lifecycle_actor\(p_actor_id, v_removal\.pro_profile_id, false\); exception when sqlstate 'p0001' then if sqlerrm = 'forbidden' then raise exception using errcode = 'p0001', message = 'not_found'; end if; raise; end;/gu,
      ),
    ].length,
    2,
    'prepare and finalize must only collapse explicit authorization denials and rethrow other errors',
  );
  assert.match(sql, /revoke all on function public\.remove_pro_credential_evidence/u);
  assert.match(
    sql,
    /grant execute on function public\.prepare_pro_credential_evidence_removal[\s\S]*to service_role/u,
  );
  assert.match(
    sql,
    /revoke all on table public\.pro_credential_evidence_removals from public, anon, authenticated, service_role/u,
  );
  assert.doesNotMatch(
    sql,
    /grant (?:select|insert|update|delete|all)[^;]*on table public\.pro_credential_evidence_removals/u,
  );
  assert.doesNotMatch(sql, /to authenticated/u);
  assert.match(sql, /removal_reservation_immutable/u);
  assert.match(sql, /set status = 'complete', storage_path = null/u);
});

test('0068 defines normalized lifecycle, evidence, decision, receipt, term, and link tables', () => {
  const sql = migration(0);
  for (const table of [
    'pro_credentials',
    'pro_credential_evidence',
    'pro_credential_decisions',
    'pro_lifecycle_operation_receipts',
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
  const identifierShape = sql.slice(
    sql.indexOf('constraint pro_credentials_identifier_shape'),
    sql.indexOf('constraint pro_credentials_authority_shape'),
  );
  assert.match(identifierShape, /legacy_unmasked/u);
  assert.match(identifierShape, /identifier_ciphertext is not null/u);
  assert.match(identifierShape, /identifier_hash is null/u);
  assert.match(identifierShape, /identifier_last4 is null/u);
  assert.match(sql, /identifier_hash is null/u);
  assert.match(sql, /identifier_last4 is null/u);
});

test('0069 defines fixed-path service workflows, eligibility, timeline, and expiry job', () => {
  assert.equal(existsSync(join(process.cwd(), migrationPaths[1])), true, migrationPaths[1]);
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
    'open_pro_credential_evidence_metadata',
    'create_pro_commercial_term_draft',
    'activate_pro_commercial_term',
    'end_pro_commercial_term',
    'evaluate_pro_assignment_eligibility',
    'read_pro_lifecycle_timeline',
    'materialize_expired_pro_credentials',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`${fn}[\\s\\S]*set search_path = ''`, 'u'));
  }
  assert.match(sql, /alter function %s owner to postgres/u);
  assert.match(sql, /revoke all on function %s from public, anon, authenticated, service_role/u);
  assert.match(sql, /grant execute on function %s to service_role/u);
  assert.match(sql, /p_expected_version bigint/u);
  assert.match(sql, /p_operation_id uuid/u);
  assert.match(sql, /p_payload_hash text/u);
  assert.match(sql, /operation_reused/u);
  assert.match(sql, /stale_credential_version/u);
  assert.match(
    sql,
    /verify_pro_credential[\s\S]*where id = p_credential_id and version = p_expected_version and state = 'under_review'/u,
  );
  assert.match(
    sql,
    /activate_pro_commercial_term[\s\S]*where id = p_term_id and version = p_expected_version and status = 'draft'/u,
  );
  assert.match(sql, /timezone\('asia\/dubai', pg_catalog\.now\(\)\)::date/u);
  assert.match(sql, /for update skip locked/u);
  assert.match(sql, /45 2 \* \* \*/u);
  assert.match(sql, /created_at < pg_catalog\.now\(\) - interval '90 days'/u);
  assert.match(sql, /function public\.authorize_pro_lifecycle_actor/u);
  assert.match(sql, /function public\.assert_safe_pro_decision_reason/u);
  assert.match(sql, /function public\.write_pro_lifecycle_audit/u);
  assert.match(sql, /pro_lifecycle_changed/u);
  assert.match(sql, /invalid_decision_reason/u);
  assert.match(
    sql,
    /activate_pro_commercial_term[\s\S]*select pro_profile_id into v_pro_profile_id[\s\S]*assert_pro_lifecycle_actor[\s\S]*where id = p_term_id for update/u,
  );
  assert.match(
    sql,
    /end_pro_commercial_term[\s\S]*select pro_profile_id into v_pro_profile_id[\s\S]*assert_pro_lifecycle_actor[\s\S]*where id = p_term_id for update/u,
  );
  assert.match(
    sql,
    /read_pro_lifecycle_timeline[\s\S]*authorize_pro_lifecycle_actor\(p_actor_id, p_pro_profile_id, false\)/u,
  );
  for (const code of [
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
  ]) {
    assert.match(sql, new RegExp(`'${code}'`, 'u'));
  }
  for (const protectedKey of [
    'identifier_ciphertext',
    'identifier_hash',
    'storage_path',
    'sha256',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`jsonb_build_object\\([^;]*'${protectedKey}'`, 'u'));
  }
  assert.match(sql, /if v_function_name in \([\s\S]*grant execute on function %s to service_role/u);
});

test('0086 requires zero credential history for create and preserves terminal replacement chains', () => {
  const sql = readFileSync(join(process.cwd(), credentialHistoryMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  assert.match(sql, /function public\.create_pro_credential_draft/u);
  assert.match(sql, /set search_path = ''/u);
  assert.match(
    sql,
    /from public\.pro_credentials[\s\S]*pro_profile_id = p_pro_profile_id[\s\S]*for update/u,
  );
  assert.match(sql, /credential_history_exists/u);
  assert.match(sql, /alter function public\.create_pro_credential_draft[\s\S]*owner to postgres/u);
  assert.match(
    sql,
    /revoke all on function public\.create_pro_credential_draft[\s\S]*from public, anon, authenticated, service_role/u,
  );
  assert.match(
    sql,
    /grant execute on function public\.create_pro_credential_draft[\s\S]*to service_role/u,
  );
  const fixture = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_credential_history_integrity.sql'),
    'utf8',
  ).toLowerCase();
  for (const state of ['rejected', 'expired', 'revoked']) {
    assert.match(fixture, new RegExp(`'${state}'::public\\.pro_credential_state`, 'u'));
  }
  assert.match(fixture, /create_pro_credential_draft/u);
  assert.match(fixture, /create_pro_credential_replacement/u);
  assert.match(
    fixture,
    /insert into public\.pro_credentials \([\s\S]*version[\s\S]*values \(v_target, v_state, 1,/u,
  );
  assert.match(fixture, /v_target, v_old_id, 1,/u);
  assert.match(fixture, /supersedes_credential_id/u);
  assert.match(fixture, /credential_replay_changed/u);
  assert.match(fixture, /expected_credential_history_exists_for_new_operation/u);
});

test('0085 installs the profile self edit audit event used by account actions', () => {
  const sql = readFileSync(join(process.cwd(), profileSelfUpdateMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  assert.match(
    sql,
    /alter type public\.auth_event_kind add value if not exists 'profile_self_edited'/u,
  );
});

test('0086b makes commercial-term versions row-local without weakening date or ownership constraints', () => {
  assert.equal(existsSync(join(process.cwd(), commercialTermIntegrityMigrationPath)), true);
  const sql = readFileSync(join(process.cwd(), commercialTermIntegrityMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  assert.match(
    sql,
    /alter table public\.pro_commercial_terms drop constraint pro_commercial_terms_profile_kind_version/u,
  );
  assert.doesNotMatch(sql, /drop constraint pro_commercial_terms_profile_identity/u);
  assert.doesNotMatch(sql, /drop constraint pro_commercial_terms_active_date_exclusion/u);
  const createDraft = sql.slice(
    sql.indexOf('create or replace function public.create_pro_commercial_term_draft'),
    sql.indexOf('create or replace function public.activate_pro_commercial_term'),
  );
  assert.match(createDraft, /'draft', 1, p_actor_id/u);
  assert.match(createDraft, /'version', 1/u);
  assert.doesNotMatch(createDraft, /max\(version\)|v_version/u);
  assert.match(createDraft, /assert_pro_lifecycle_actor/u);
  assert.match(createDraft, /pro_lifecycle_replay_result/u);
  assert.match(createDraft, /store_pro_lifecycle_receipt/u);
  assert.match(createDraft, /write_pro_lifecycle_audit/u);
  assert.match(createDraft, /insert into public\.pro_commercial_term_events/u);
  for (const signature of [
    'create_pro_commercial_term_draft[\\s\\S]*date, date',
    'activate_pro_commercial_term\\(uuid, uuid, bigint, uuid, text\\)',
    'end_pro_commercial_term\\(uuid, uuid, bigint, uuid, text, date\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(`alter function public\\.${signature}[\\s\\S]*owner to postgres`, 'u'),
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${signature}[\\s\\S]*from public, anon, authenticated, service_role`,
        'u',
      ),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${signature}[\\s\\S]*to service_role`, 'u'),
    );
  }
  assert.equal([...sql.matchAll(/security definer set search_path = ''/gu)].length, 3);
});

test('0086b rejects future commercial-term activation on the Dubai business date', () => {
  const sql = readFileSync(join(process.cwd(), commercialTermIntegrityMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  const activate = sql.slice(
    sql.indexOf('create or replace function public.activate_pro_commercial_term'),
    sql.indexOf('create or replace function public.end_pro_commercial_term'),
  );
  assert.match(
    activate,
    /v_today date := pg_catalog\.timezone\('asia\/dubai', pg_catalog\.now\(\)\)::date/u,
  );
  assert.match(
    activate,
    /if v_term\.status <> 'draft' or v_term\.effective_from > v_today or \(v_term\.effective_to is not null and v_term\.effective_to > v_today\) then[\s\S]*invalid_term_transition/u,
  );
  assert.match(activate, /pro_lifecycle_replay_result/u);
  assert.match(activate, /stale_term_version/u);
  assert.match(activate, /store_pro_lifecycle_receipt/u);
  assert.match(activate, /commercial_term_(?:activated|ended)/u);
  assert.match(activate, /insert into public\.pro_commercial_term_events/u);
  assert.ok(
    activate.indexOf('v_term.effective_to > v_today') <
      activate.indexOf('select * into v_previous'),
    'future activation boundaries must fail before the current active term is ended',
  );
});

test('0086b rejects future commercial-term end on the Dubai business date', () => {
  const sql = readFileSync(join(process.cwd(), commercialTermIntegrityMigrationPath), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
  const end = sql.slice(sql.indexOf('create or replace function public.end_pro_commercial_term'));
  assert.match(
    end,
    /v_today date := pg_catalog\.timezone\('asia\/dubai', pg_catalog\.now\(\)\)::date/u,
  );
  assert.match(
    end,
    /if v_term\.status <> 'active' or p_effective_to < v_term\.effective_from or p_effective_to > v_today then[\s\S]*invalid_term_transition/u,
  );
  assert.match(end, /pro_lifecycle_replay_result/u);
  assert.match(end, /stale_term_version/u);
  assert.match(end, /store_pro_lifecycle_receipt/u);
  assert.match(end, /commercial_term_ended/u);
  assert.match(end, /insert into public\.pro_commercial_term_events/u);
  assert.ok(
    end.indexOf('p_effective_to > v_today') < end.indexOf('update public.pro_commercial_terms'),
    'future end must fail before the active term is ended',
  );
});

test('commercial-term SQL regression proves two pricing and compensation rotations and date boundaries', () => {
  const fixturePath = join(process.cwd(), 'supabase/tests/pro_commercial_term_integrity.sql');
  assert.equal(existsSync(fixturePath), true);
  const fixture = readFileSync(fixturePath, 'utf8').replace(/\s+/gu, ' ').toLowerCase();
  assert.match(fixture, /\\set on_error_stop on/u);
  assert.match(fixture, /set statement_timeout/u);
  assert.match(fixture, /foreach v_term_kind in array/u);
  assert.match(fixture, /for v_rotation in 1\.\.2 loop/u);
  assert.match(fixture, /expected_two_successive_rotations/u);
  assert.match(fixture, /expected_future_effective_to_activation_rejection/u);
  assert.match(fixture, /future_effective_to_activation_changed_current_term/u);
  assert.match(fixture, /expected_future_activation_rejection/u);
  assert.match(fixture, /expected_future_end_rejection/u);
  assert.match(fixture, /evaluate_pro_assignment_eligibility/u);
  assert.match(fixture, /expected_eligible_after_future_boundary_rejections/u);
  assert.match(fixture, /pro_commercial_terms_profile_kind_version/u);
  assert.match(fixture, /pro_commercial_terms_profile_identity/u);
  assert.match(fixture, /pro_commercial_terms_active_date_exclusion/u);
});

test('Step 3 SQL fixtures cover transitions and bounded credential and term races', () => {
  for (const fixture of [
    'pro_lifecycle_transitions.sql',
    'pro_lifecycle_valid_content.sql',
    'pro_lifecycle_concurrency_setup.sql',
    'pro_lifecycle_verify_session_a.sql',
    'pro_lifecycle_verify_session_b.sql',
    'pro_lifecycle_terms_session_a.sql',
    'pro_lifecycle_terms_session_b.sql',
    'pro_lifecycle_evidence_removal.sql',
    'pro_lifecycle_removal_session_a.sql',
    'pro_lifecycle_removal_session_b.sql',
    'pro_lifecycle_removal_concurrency_setup.sql',
    'pro_lifecycle_evidence_recovery.sql',
    'pro_lifecycle_recovery_concurrency_setup.sql',
    'pro_lifecycle_recovery_session_a.sql',
    'pro_lifecycle_recovery_session_b.sql',
    'pro_credential_identifier_preservation.sql',
    'pro_commercial_term_integrity.sql',
  ]) {
    const path = join(process.cwd(), 'supabase/tests', fixture);
    assert.equal(existsSync(path), true, fixture);
    const source = readFileSync(path, 'utf8');
    assert.match(source, /ON_ERROR_STOP on/u);
    assert.match(source, /statement_timeout/u);
  }
  const recovery = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_evidence_recovery.sql'),
    'utf8',
  ).replace(/\s+/gu, ' ');
  assert.match(recovery, /claim_pro_credential_evidence_removal_recovery/u);
  assert.match(recovery, /EXPECTED_OLD_FINALIZE_FENCE/u);
  assert.match(recovery, /EVIDENCE_REMOVAL_LEASE_ACTIVE/u);
  assert.match(recovery, /EVIDENCE_REMOVAL_CLAIM_LOST/u);
  assert.match(recovery, /originalActorId/u);
  assert.match(recovery, /recoveryActorId/u);
  assert.match(recovery, /status = 'cancelled'/u);
  assert.match(recovery, /UNSAFE_RETENTION_CLEANUP/u);
  assert.doesNotMatch(recovery, /select id,[^;]*'draft'[^;]*from unnest/u);
  assert.match(recovery, /select id,[^;]*'rejected'[^;]*from unnest/u);
  assert.equal([...recovery.matchAll(/set state = 'draft'/gu)].length, 4);
  assert.equal([...recovery.matchAll(/set state = 'rejected'/gu)].length, 3);
  assert.doesNotMatch(recovery, /set status = 'inactive'/u);
  assert.match(recovery, /set status = 'disabled'/u);
  assert.equal(
    [...recovery.matchAll(/set_config\('storage\.allow_delete_query', 'true', true\)/gu)].length,
    [...recovery.matchAll(/delete from storage\.objects/gu)].length,
  );
  const preservation = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_credential_identifier_preservation.sql'),
    'utf8',
  );
  assert.match(preservation, /p_preserve_identifier/u);
  assert.match(preservation, /EXPECTED_MISSING_IDENTIFIER_REJECTION/u);
  assert.match(preservation, /EXPECTED_LEGACY_IDENTIFIER_REJECTION/u);
  assert.match(preservation, /PRESERVED_IDENTIFIER_CHANGED/u);
  assert.match(preservation, /EXPECTED_OPERATION_REUSED/u);
  assert.match(preservation, /EXPECTED_STALE_CREDENTIAL_VERSION/u);
  const raceA = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_recovery_session_a.sql'),
    'utf8',
  );
  const raceB = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_recovery_session_b.sql'),
    'utf8',
  );
  assert.match(raceA, /delete from storage\.objects/u);
  assert.match(raceA, /set_config\('storage\.allow_delete_query', 'true', true\)/u);
  assert.match(raceA, /EVIDENCE_REMOVAL_IN_PROGRESS/u);
  assert.match(raceA, /classid = 69004 and objid = 2 and granted/u);
  assert.match(raceB, /claim_pro_credential_evidence_removal_recovery/u);
  assert.match(raceB, /delete from storage\.objects/u);
  assert.match(raceB, /set_config\('storage\.allow_delete_query', 'true', true\)/u);
  assert.match(raceB, /finalize_pro_credential_evidence_removal_recovery/u);
  assert.match(raceB, /pg_advisory_xact_lock\(69004, 2\)/u);
  const removal = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_evidence_removal.sql'),
    'utf8',
  ).replace(/\s+/gu, ' ');
  assert.doesNotMatch(removal, /93000000-0000-4000-8000-000000000022/u);
  assert.match(
    removal,
    /93000000-0000-4000-8000-000000000012[^;]*93000000-0000-4000-8000-000000000021', 'draft'/u,
  );
});

test('transition fixture checks protected canaries in every persisted lifecycle event surface', () => {
  const fixture = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_transitions.sql'),
    'utf8',
  );
  for (const surface of [
    'auth_events',
    'pro_credential_decisions',
    'pro_commercial_term_events',
    'pro_lifecycle_operation_receipts',
  ]) {
    assert.match(fixture, new RegExp(`${surface}[\\s\\S]*UNSAFE_PERSISTED_LIFECYCLE_CANARY`, 'u'));
  }
  assert.match(fixture, /synthetic-ciphertext/u);
  assert.match(fixture, /pro-credentials\//u);
  assert.match(fixture, /repeat\('0123456789abcdef', 4\)/u);
  assert.match(fixture, /repeat\('fedcba9876543210', 4\)/u);
  for (const canary of [
    'TASK13-CANARY-IDENTIFIER-9Z72',
    'v1:TASK13-CANARY-CIPHERTEXT',
    'pro-credentials/TASK13-CANARY-STORAGE-PATH',
    'https://storage.invalid/TASK13-CANARY-SIGNED-URL',
    'TASK13-CANARY-RAW-PROVIDER-ERROR',
  ]) {
    assert.match(fixture, new RegExp(canary.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(fixture, /v_canary_keys text\[\][\s\S]*'identifierCiphertext'[\s\S]*'rawError'/u);
  assert.match(fixture, /for v_canary_index[\s\S]*store_pro_lifecycle_receipt/u);
  assert.match(
    fixture,
    /jsonb_build_object\([\s\S]*v_canary_keys\[v_canary_index\][\s\S]*v_canaries\[v_canary_index\]/u,
  );
  for (const suffix of ['AUTH_EVENT', 'DECISION', 'TERM_EVENT', 'RECEIPT']) {
    assert.match(fixture, new RegExp(`UNSAFE_PERSISTED_LIFECYCLE_CANARY_${suffix}`, 'u'));
  }
});

test('0082 rejects protected decision reasons and direct unsafe receipt payloads', () => {
  const path = join(
    process.cwd(),
    'supabase/migrations/20260824140000_0082_pro_lifecycle_persistence_canary_guards.sql',
  );
  assert.equal(existsSync(path), true);
  const sql = readFileSync(path, 'utf8').replace(/\s+/gu, ' ').toLowerCase();
  assert.match(sql, /create or replace function public\.assert_safe_pro_lifecycle_result/u);
  assert.match(sql, /jsonb_object_keys/u);
  assert.match(sql, /unsafe_lifecycle_result/u);
  assert.match(sql, /https\?/u);
  assert.match(sql, /signed/u);
  assert.match(sql, /raw/u);
  assert.match(sql, /provider/u);
  assert.match(sql, /\[0-9a-f\]\{64\}/u);
  assert.match(sql, /perform public\.assert_safe_pro_lifecycle_result/u);
  assert.match(sql, /revoke all on function public\.assert_safe_pro_lifecycle_result/u);
});

test('0083 preserves approved reason and authority values behind structural guards', () => {
  const path = join(
    process.cwd(),
    'supabase/migrations/20260824150000_0083_pro_lifecycle_structural_persistence_guards.sql',
  );
  assert.equal(existsSync(path), true);
  const sql = readFileSync(path, 'utf8').replace(/\s+/gu, ' ').toLowerCase();
  assert.match(sql, /create or replace function public\.assert_safe_pro_decision_reason/u);
  assert.doesNotMatch(sql, /https\?:\/\//u);
  assert.doesNotMatch(sql, /\[0-9a-f\]\{64\}/u);
  assert.match(sql, /jsonb_object_keys/u);
  assert.match(sql, /mask(?:ed)?identifier/u);
  assert.match(sql, /unsafe_lifecycle_result/u);
  for (const forbiddenKey of [
    'identifier',
    'identifierciphertext',
    'identifierhash',
    'storagepath',
    'signedurl',
    'rawerror',
  ]) {
    assert.doesNotMatch(sql, new RegExp(`'${forbiddenKey}'`, 'u'));
  }

  const fixture = readFileSync(
    join(process.cwd(), 'supabase/tests/pro_lifecycle_valid_content.sql'),
    'utf8',
  );
  assert.match(fixture, /The identifier could not be verified/u);
  assert.match(fixture, /https:\/\/authority\.example/u);
  assert.match(fixture, /save_pro_credential_draft/u);
  assert.match(fixture, /revoke_pro_credential/u);
});

test('0084 rejects structured decision secrets without restoring generic value blacklists', () => {
  const path = join(
    process.cwd(),
    'supabase/migrations/20260824160000_0084_pro_decision_structured_secret_guards.sql',
  );
  assert.equal(existsSync(path), true);
  const sql = readFileSync(path, 'utf8').replace(/\s+/gu, ' ').toLowerCase();
  assert.match(sql, /create or replace function public\.assert_safe_pro_decision_reason/u);
  assert.match(sql, /storage\/v1\/object\/sign/u);
  assert.match(sql, /identifier\[ _-\]\*hash/u);
  assert.match(sql, /raw\[ _-\]\*provider\[ _-\]\*error/u);
  assert.match(sql, /v\[0-9\]\+:/u);
  assert.doesNotMatch(sql, /or p_reason ~\* 'https\?:\/\/'/u);
  assert.doesNotMatch(sql, /or p_reason ~\* '\[0-9a-f\]\{64\}'/u);
});

test('audit and term producers structurally cannot accept protected payload channels', () => {
  const workflow = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260821101000_0069_pro_lifecycle_workflows.sql'),
    'utf8',
  );
  const audit = workflow.slice(
    workflow.indexOf('create or replace function public.write_pro_lifecycle_audit'),
    workflow.indexOf('create or replace function public.pro_lifecycle_replay_result'),
  );
  assert.match(audit, /p_action text,[\s\S]*p_entity_id uuid,[\s\S]*p_version bigint/u);
  assert.doesNotMatch(audit, /p_(?:details|payload|identifier|ciphertext|hash|path|url|error)/iu);
  assert.match(
    audit,
    /jsonb_build_object\([\s\S]*'action'[\s\S]*'targetProProfileId'[\s\S]*'entityId'[\s\S]*'version'/u,
  );

  const schema = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260821100000_0068_pro_lifecycle_schema.sql'),
    'utf8',
  );
  const termEvents = schema.slice(
    schema.indexOf('create table public.pro_commercial_term_events'),
    schema.indexOf('create table public.pro_lifecycle_operation_receipts'),
  );
  assert.doesNotMatch(
    termEvents,
    /\b(?:json|jsonb|details|reason|identifier|ciphertext|hash|path|url|error)\b/iu,
  );

  const credentialDal = readFileSync('src/lib/data/pro-credentials.ts', 'utf8');
  assert.match(credentialDal, /encrypt\(parsed\.identifier\)/u);
  assert.match(credentialDal, /createBlindIndex\([^;]*parsed\.identifier/u);
  assert.doesNotMatch(credentialDal, /p_identifier(?:\W|$)/u);
  const downloadRoute = readFileSync(
    'src/app/api/v1/account/pro/credentials/evidence/download/route.ts',
    'utf8',
  );
  assert.doesNotMatch(downloadRoute, /signedUrl|signed_url|createSignedUrl/iu);
  assert.doesNotMatch(workflow, /p_(?:signed_url|raw_error)/iu);
});

test('0070 reconciles live access, term-linked assignments, grants, and legacy columns', () => {
  assert.equal(existsSync(join(process.cwd(), migrationPaths[2])), true, migrationPaths[2]);
  const sql = migration(2);
  for (const fn of [
    'has_current_pro_credential',
    'authorize_pro_company_access',
    'read_authoritative_pro_tenant',
    'read_pro_credential_snapshot',
    'read_pro_commercial_terms',
    'list_eligible_pros_for_company',
    'has_company_access',
    'assign_pro_to_company',
    'reassign_company_pro',
  ]) {
    assert.match(sql, new RegExp(`function public\\.${fn}`, 'u'));
    assert.match(sql, new RegExp(`${fn}[\\s\\S]*set search_path = ''`, 'u'));
  }
  assert.match(sql, /state = 'verified'/u);
  assert.match(sql, /expiry_date >= timezone\('asia\/dubai', pg_catalog\.now\(\)\)::date/u);
  assert.match(sql, /evaluate_pro_assignment_eligibility/u);
  assert.match(sql, /pro_pricing_not_configured/u);
  assert.match(sql, /pro_compensation_not_configured/u);
  assert.match(sql, /insert into public\.pro_assignment_term_links/u);
  assert.match(sql, /pricing_term_id/u);
  assert.match(sql, /compensation_term_id/u);
  assert.match(sql, /drop column license_no_encrypted/u);
  assert.match(sql, /drop column credentials_verified/u);
  assert.match(sql, /drop column verified_at/u);
  assert.match(sql, /drop column verified_by_profile_id/u);
  assert.match(
    sql,
    /revoke all on table public\.pro_credentials from public, anon, authenticated/u,
  );
  assert.match(sql, /revoke all on table public\.pro_credentials from service_role/u);
  assert.match(sql, /grant select on table public\.pro_credentials to service_role/u);
  assert.match(
    sql,
    /grant execute on function public\.has_company_access\(uuid\) to authenticated, service_role/u,
  );
});
