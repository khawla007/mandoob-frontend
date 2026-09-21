import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260916041000_0102_admin_document_center.sql',
);

test('admin document center migration is service-only, bounded, exact, and deterministic', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  assert.match(sql, /create or replace function public\.list_admin_document_center/u);
  assert.match(
    sql,
    /revoke all on function public\.list_admin_document_center[\s\S]*from public, anon, authenticated/iu,
  );
  assert.match(
    sql,
    /grant execute on function public\.list_admin_document_center[\s\S]*to service_role/iu,
  );
  assert.match(sql, /least\(greatest\(p_page_size, 1\), 25\)/u);
  assert.match(sql, /count\(\*\)/u);
  assert.match(sql, /effective_page/u);
  assert.match(sql, /order by[\s\S]*created_at[\s\S]*entity_kind[\s\S]*entity_id/iu);
  assert.match(sql, /join public\.tenants/u);
  assert.match(sql, /join public\.company_profiles/u);
  assert.doesNotMatch(sql, /storage_path|sha256|signed_url/iu);
});

test('admin projection returns only approved display fields', () => {
  const sql = readFileSync(migrationPath, 'utf8');
  for (const field of [
    'workspaceName',
    'companyName',
    'docType',
    'label',
    'requestStatus',
    'dueAt',
    'uploadedAt',
    'reviewStatus',
    'expiresOn',
  ]) {
    assert.match(sql, new RegExp(`'${field}'`, 'u'));
  }
  assert.doesNotMatch(sql, /'tenantId'|'companyId'|'documentId'|'versionId'|'entityId'/u);
});
