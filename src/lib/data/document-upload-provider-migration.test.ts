import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migration = resolve(
  'supabase/migrations/20260916040700_0099_document_upload_provider_identity.sql',
);
function source(): string {
  assert.ok(existsSync(migration), 'forward provider identity migration is missing');
  return readFileSync(migration, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ');
}

function boundary(sql: string): void {
  for (const name of [
    'prepare_document_upload',
    'claim_document_upload_cleanup',
    'authorize_document_upload_cleanup',
    'reconcile_document_upload_cleanup',
    'list_document_upload_cleanup_candidates',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `create or replace function public\\.${name}\\([\\s\\S]*?security definer set search_path = ''`,
      ),
    );
    assert.match(sql, new RegExp(`alter function public\\.${name}\\([^;]+ owner to postgres`));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated, service_role`,
      ),
    );
    assert.match(
      sql,
      new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`),
    );
  }
  for (const [key, column] of [
    ['tenantId', 'tenant_id'],
    ['companyId', 'company_id'],
    ['operationId', 'operation_id'],
    ['objectId', 'object_id'],
    ['documentId', 'document_id'],
    ['versionId', 'reserved_version_id'],
    ['extension', 'extension'],
    ['storagePath', 'storage_path'],
  ]) {
    assert.match(sql, new RegExp(`'${key}',\\s*[a-z]+\\.${column}\\b`));
  }
  for (const name of [
    'prepare_document_upload',
    'claim_document_upload_cleanup',
    'authorize_document_upload_cleanup',
    'reconcile_document_upload_cleanup',
  ]) {
    assert.match(
      sql,
      new RegExp(`alter function public\\.${name}\\([^;]+ rename to _document_upload_[a-z_]+`),
    );
  }
  assert.match(
    sql,
    /revoke all on function public\._document_upload_[^;]+ from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(sql, /(?:split_part|regexp_match|substring)\s*\([^;]*storage_path/i);
  assert.doesNotMatch(
    sql,
    /(?:disable trigger|delete from|truncate|grant\s+(?:all|select)\s+on\s+(?:table\s+)?public\.document_upload_operations)/i,
  );
  for (const needle of [
    'p_tenant_id is null',
    'p_company_id is null',
    'p_limit is null',
    'p_limit not between 1 and 25',
    "errcode='DU422'",
    "'candidates'",
    "'operations'",
    'cleanup_hold',
    'cleanup_lease_until',
    'deadline_at',
    'clock_timestamp()',
    "'prepared'",
    "'cleanup_pending'",
    'committed_receipt',
    'finalized_at',
    'document_versions',
    'current_version_id',
    'reserved_version_id',
    'upload_operation_id',
    'storage_path',
    'document_lifecycle_audit',
    "'upload_finalized'",
  ])
    assert.ok(sql.includes(needle), `provider invariant missing: ${needle}`);
  assert.match(sql, /order by [a-z]+\.deadline_at\s*,\s*[a-z]+\.operation_id/);
  assert.match(sql, /limit p_limit/);
  assert.match(sql, /[a-z]+\.tenant_id\s*=\s*p_tenant_id/);
  assert.match(sql, /[a-z]+\.company_id\s*=\s*p_company_id/);
}

test('provider identity correction is forward-only, independent and service-only', () =>
  boundary(source()));
test('applied provider responses gain an independently sourced reserved object identity', () => {
  const sql = [
    'supabase/migrations/20260916040300_0095_document_upload_lock_contention.sql',
    'supabase/migrations/20260916040400_0096_document_upload_cleanup_fencing.sql',
    ...(existsSync(migration) ? [migration] : []),
  ]
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  assert.ok(
    /'objectId',\s*[a-z]+\.object_id\b/.test(sql),
    'private provider responses lack independently sourced reserved objectId',
  );
});
test('provider contract detects identity, scope, bound and reference regressions', () => {
  const sql = source();
  for (const needle of [
    'object_id',
    'p_limit not between 1 and 25',
    'cleanup_hold',
    'committed_receipt',
    'document_versions',
    'document_lifecycle_audit',
    'limit p_limit',
    'owner to postgres',
    "search_path = ''",
  ]) {
    assert.throws(() => boundary(sql.replaceAll(needle, 'REMOVED')));
  }
});
