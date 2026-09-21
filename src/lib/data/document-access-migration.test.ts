import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migration = resolve('supabase/migrations/20260916040500_0097_document_access_boundary.sql');
function source(): string {
  assert.ok(existsSync(migration), 'audited document access migration is missing');
  return readFileSync(migration, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ');
}
function boundary(sql: string): void {
  for (const table of ['document_requests', 'documents', 'document_versions']) {
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table} from public, anon, authenticated, service_role`,
      ),
    );
    if (table !== 'document_versions') {
      assert.match(
        sql,
        new RegExp(`grant select on table public\\.${table} to authenticated, service_role`),
      );
    }
  }
  assert.match(sql, /grant select \([^;]+\) on table public\.document_versions to authenticated/);
  assert.doesNotMatch(sql, /grant select on table public\.document_versions to authenticated/);
  const safeMetadata = sql.match(
    /grant select \(([^;]+)\) on table public\.document_versions to authenticated/,
  )?.[1];
  assert.ok(safeMetadata);
  assert.doesNotMatch(safeMetadata, /storage_path|sha256|upload_operation_id/);
  // Rebuild the actual cumulative policy set, not merely new policy names.
  assert.match(
    sql,
    /pg_catalog\.pg_policy[\s\S]*?document_requests[\s\S]*?documents[\s\S]*?document_versions[\s\S]*?drop policy/,
  );
  assert.match(sql, /on storage\.objects as restrictive for all to anon, authenticated/);
  assert.match(sql, /bucket_id <> 'tenant-documents' or name like 'pro-credentials\/%'/);
  assert.doesNotMatch(sql, /drop policy[^;]+on storage\.objects/);
  for (const rpc of ['resolve_document_access', 'finalize_document_access_grant']) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${rpc}\\([\\s\\S]*?security definer set search_path = ''`,
      ),
    );
    assert.match(sql, new RegExp(`alter function public\\.${rpc}\\([^;]+ owner to postgres`));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${rpc}\\([^;]+ from public, anon, authenticated, service_role`,
      ),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${rpc}\\([^;]+ to service_role`),
    );
  }
  for (const needle of [
    'create table public.document_access_audit',
    'before update or delete on public.document_access_audit',
    'before truncate on public.document_access_audit',
    'revoke all on table public.document_access_audit from public, anon, authenticated, service_role',
    "update storage.buckets set public=false where id='tenant-documents'",
    'authorize_pro_company_access',
    'auth.uid()',
    'actor.mfa_enrolled_at is not null',
    "auth.jwt()->>'aal'='aal2'",
    'linked_company_id',
    "state='finalized'",
    "scan_provider='clamav'",
    'scan_completed_at',
    'upload_operation_id',
    'reserved_version_id',
    'storage_path',
    'sha256',
    "review_status='rejected'",
    "at time zone 'Asia/Dubai'",
    'expires_on',
    'between 1 and 300',
    'for share nowait',
    'lock_not_available',
    "errcode='DU409'",
    'document-upload-operation:',
    'document-upload-resource',
    "'status','denied'",
    "'access_granted'",
    "'access_denied'",
  ])
    assert.ok(sql.includes(needle), `access invariant missing: ${needle}`);
  const audit = sql.match(/create table public\.document_access_audit \([\s\S]*?\);/)?.[0];
  assert.ok(audit);
  assert.doesNotMatch(audit, /references|jsonb|storage_path|filename|url|token|provider_error/i);
  assert.match(audit, /sha256 text check/);
  assert.doesNotMatch(
    audit,
    /(?:actor_id|document_id|version_id|sha256)\s+(?:uuid|text)\s+not null/i,
  );
  assert.doesNotMatch(sql, /for (?:share|update)(?! nowait)/);
  assert.doesNotMatch(
    sql,
    /alter table public\.(?:pro_credentials|pro_company_assignments)|disable trigger|grant (?:all|insert|update|delete).*service_role/i,
  );
  assert.match(sql, /p_expected_sha256[\s\S]*?is distinct from/);
}
test('document access is cumulatively fenced, private, rechecked and audited', () =>
  boundary(source()));
test('static boundary detects removal of critical access safeguards', () => {
  const sql = source();
  for (const needle of [
    'as restrictive',
    'pg_catalog.pg_policy',
    'authorize_pro_company_access',
    'linked_company_id',
    "scan_provider='clamav'",
    'upload_operation_id',
    "review_status='rejected'",
    "at time zone 'Asia/Dubai'",
    'between 1 and 300',
    'nowait',
    'lock_not_available',
    "'access_granted'",
    "'access_denied'",
    'before truncate on public.document_access_audit',
    'public=false',
    'actor.mfa_enrolled_at is not null',
    "auth.jwt()->>'aal'='aal2'",
  ])
    assert.throws(() => boundary(sql.replaceAll(needle, 'REMOVED')), needle);
});

const wallclockMigration = resolve(
  'supabase/migrations/20260916040600_0098_document_access_wallclock_authority.sql',
);
function wallclockSource(): string {
  assert.ok(existsSync(wallclockMigration), 'forward wall-clock authority migration is missing');
  return readFileSync(wallclockMigration, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ');
}
function wallclockBoundary(sql: string): void {
  for (const needle of [
    'public._document_access_business_date()',
    "clock_timestamp() at time zone 'Asia/Dubai'",
    'public._document_access_current_pro_credential(p_actor_id)',
    'expiry_date >= public._document_access_business_date()',
    "credential_type='pro_license' and state='verified'",
    'for share nowait',
    "errcode='DU409'",
  ])
    assert.ok(sql.includes(needle), `wall-clock invariant missing: ${needle}`);
  const context = sql.match(
    /create or replace function public\._document_access_context\([\s\S]*?end; \$\$;/,
  )?.[0];
  const grant = sql.match(
    /create or replace function public\.finalize_document_access_grant\([\s\S]*?end; \$\$;/,
  )?.[0];
  assert.ok(context, 'own context must be fully redefined');
  assert.ok(grant, 'grant must freshly recheck wall-clock authority');
  assert.ok(
    context.lastIndexOf('public._document_access_current_pro_credential(p_actor_id)') >
      context.lastIndexOf('for share nowait'),
  );
  assert.ok(
    grant.indexOf('public._document_access_current_pro_credential(p_actor_id)') <
      grant.indexOf("'access_granted'"),
  );
  assert.match(
    sql,
    /actor\.role='pro'[\s\S]*?public\.authorize_pro_company_access[\s\S]*?expiry_date >= public\._document_access_business_date\(\)/,
  );
  for (const signature of [
    '_document_access_business_date\\(\\)',
    '_document_access_current_pro_credential\\(uuid\\)',
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${signature} owner to postgres`));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${signature} from public, anon, authenticated, service_role`,
      ),
    );
  }
  assert.doesNotMatch(
    sql,
    /pg_catalog\.now\(\)|p_(?:now|clock|business_date)|alter table public\.(?:pro_credentials|pro_company_assignments)|function public\.(?:has_current_pro_credential|authorize_pro_company_access|_document_upload_)/,
  );
}
test('access licensing uses private wall-clock date after waits, without P303 changes', () =>
  wallclockBoundary(wallclockSource()));
test('wall-clock boundary mutation controls catch missing freshness and private ACLs', () => {
  const sql = wallclockSource();
  for (const needle of [
    'clock_timestamp()',
    'expiry_date >=',
    'public._document_access_current_pro_credential(p_actor_id)',
    'for share nowait',
    'revoke all on function public._document_access_business_date()',
  ]) {
    assert.throws(() => wallclockBoundary(sql.replaceAll(needle, 'REMOVED')), needle);
  }
});
