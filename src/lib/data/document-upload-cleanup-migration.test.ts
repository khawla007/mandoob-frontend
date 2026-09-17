import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const migration = resolve(
  'supabase/migrations/20260916040400_0096_document_upload_cleanup_fencing.sql',
);
function source(): string {
  assert.ok(existsSync(migration), 'forward cleanup fencing migration is missing');
  return readFileSync(migration, 'utf8').replace(/--.*$/gm, '').replace(/\s+/g, ' ');
}
function boundary(sql: string): void {
  for (const name of [
    'reconcile_document_upload_cleanup',
    'claim_document_upload_cleanup',
    'authorize_document_upload_cleanup',
    'complete_document_upload_cleanup',
    'set_document_upload_cleanup_hold',
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
  for (const needle of [
    'cleanup_fence',
    'cleanup_lease_until',
    'cleanup_authorized',
    'cleanup_hold',
    'cleanup_pending',
    'committed_receipt',
    'clock_timestamp()',
    'document_versions',
    'storage_path',
    'upload_cleanup_claimed',
    'upload_cleanup_authorized',
    'upload_cleanup_failed',
    'upload_cleanup_completed',
    'for update nowait',
    'for share nowait',
    'lock_not_available',
    "errcode='DU409'",
    'before insert or update on storage.objects',
    'p_deleted is distinct from true',
  ]) {
    assert.ok(sql.includes(needle), `cleanup invariant missing: ${needle}`);
  }
  assert.doesNotMatch(sql, /delete from public\.(document_versions|document_lifecycle_audit)/);
  assert.doesNotMatch(sql, /alter table public\.(pro_credentials|pro_company_assignments)/);
  assert.doesNotMatch(sql, /for (?:share|update)(?! nowait)/);
}
test('cleanup is forward-only, service-only, fenced, leased and audited', () => boundary(source()));
test('cleanup boundary assertions detect removal of critical safeguards', () => {
  const sql = source();
  for (const needle of [
    'cleanup_fence',
    'cleanup_lease_until',
    'cleanup_authorized',
    'committed_receipt',
    'nowait',
    'lock_not_available',
    'before insert or update on storage.objects',
  ]) {
    assert.throws(() => boundary(sql.replaceAll(needle, 'REMOVED')));
  }
});
