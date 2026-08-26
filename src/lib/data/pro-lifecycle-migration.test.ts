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

function migration(index: number): string {
  return readFileSync(join(process.cwd(), migrationPaths[index]!), 'utf8')
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

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
