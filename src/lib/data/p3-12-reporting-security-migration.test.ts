import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260922120000_0112_p3_12_reporting_security_compliance.sql',
  ),
  'utf8',
);

test('P3.12 migration creates bounded reporting, export, audit, access and retention contracts', () => {
  for (const table of [
    'platform_audit_events',
    'data_access_events',
    'report_export_jobs',
    'retention_policy_registry',
    'erasure_legal_holds',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}\\b`, 'u'));
  }
  assert.match(migration, /max_rows integer not null[\s\S]+max_rows between 1 and 1000/u);
  assert.match(migration, /max_bytes integer not null[\s\S]+max_bytes between 1 and 5242880/u);
  assert.match(migration, /destructive_execution_enabled boolean not null default false/u);
  assert.match(migration, /policy_status[^;]+'decision_blocked'/u);
});

test('audit and access records reject mutation, truncate, unsafe metadata and browser grants', () => {
  assert.match(migration, /before update or delete on public\.platform_audit_events/u);
  assert.match(migration, /before truncate on public\.platform_audit_events/u);
  assert.match(migration, /before update or delete on public\.data_access_events/u);
  assert.match(migration, /before truncate on public\.data_access_events/u);
  assert.match(migration, /p3_12_metadata_is_safe/u);
  assert.match(migration, /octet_length\([^)]*safe_metadata::text[^)]*\) <= 4096/u);
  assert.match(
    migration,
    /revoke all on table public\.platform_audit_events from public, anon, authenticated, service_role/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.data_access_events from public, anon, authenticated, service_role/u,
  );
});

test('security-definer RPCs use fixed search paths, service-only grants and atomic audit writes', () => {
  for (const name of [
    'append_platform_audit_event',
    'append_data_access_event',
    'read_p3_12_operational_report',
    'approve_erasure_request',
    'reject_erasure_request',
    'verify_erasure_request',
    'unlock_account_with_platform_audit',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `function public\\.${name}[\\s\\S]+?security definer[\\s\\S]+?set search_path = ''`,
        'u',
      ),
      name,
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${name}[^;]+to service_role`, 'u'),
      name,
    );
  }
  assert.match(migration, /insert into public\.platform_audit_events/gu);
  assert.match(migration, /insert into public\.data_access_events/gu);
});

test('erasure verification is expiring, one-time and legal hold blocks destructive execution', () => {
  assert.match(migration, /verification_expires_at/u);
  assert.match(migration, /status = 'pending_verification'/u);
  assert.match(migration, /verification_expires_at > statement_timestamp\(\)/u);
  assert.match(migration, /verification_token_hash = null/u);
  assert.match(migration, /ERASURE_LEGAL_HOLD/u);
  assert.match(migration, /ERASURE_POLICY_EXECUTION_DISABLED/u);
});

test('finance and parallel-branch sources are explicitly unavailable in report output', () => {
  for (const code of [
    'P3_05_NOT_INTEGRATED',
    'P3_06_NOT_INTEGRATED',
    'P3_09_NOT_INTEGRATED',
    'P3_10_RUNTIME_PENDING',
  ]) {
    assert.match(migration, new RegExp(code, 'u'));
  }
});
