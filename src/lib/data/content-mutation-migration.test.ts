import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916020100_0089_editorial_content_mutation_contracts.sql',
  import.meta.url,
);

test('editorial mutations are versioned, replay-safe, audited, and service-role only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  for (const table of ['blog_posts', 'blog_terms', 'blog_media', 'cms_pages']) {
    assert.match(sql, new RegExp(`alter table public\\.${table}[\\s\\S]*row_version`, 'i'));
  }
  assert.match(sql, /create or replace function public\.mutate_editorial_content/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /content_operation_receipts/i);
  assert.match(sql, /content_audit_events/i);
  assert.match(sql, /request_hash/i);
  assert.match(sql, /stale_version/i);
  assert.match(sql, /status = 'active'[\s\S]*role in \('super_admin', 'admin'\)/i);
  assert.match(sql, /revoke all on function public\.mutate_editorial_content[\s\S]*from public/i);
  assert.match(
    sql,
    /grant execute on function public\.mutate_editorial_content[\s\S]*to service_role/i,
  );
});
