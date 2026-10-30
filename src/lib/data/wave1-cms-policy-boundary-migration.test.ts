import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../../../supabase/migrations/20260916040000_0092_wave1_cms_policy_boundary.sql',
  import.meta.url,
);

test('CMS management policy excludes anonymous readers without widening helper grants', () => {
  assert.ok(existsSync(migrationUrl), 'forward CMS policy-boundary migration is required');
  const statements = readFileSync(migrationUrl, 'utf8')
    .replace(/--[^\n]*/gu, '')
    .split(';')
    .map((statement) => statement.trim().replace(/\s+/gu, ' ').toLowerCase())
    .filter(Boolean);

  assert.deepEqual(statements, [
    'alter policy cms_pages_platform_manage on public.cms_pages to authenticated, service_role',
  ]);
});
