import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production import code has no client CSV kind, company form field or row writes', async () => {
  const files = [
    new URL('../validation/bulk-import.ts', import.meta.url),
    new URL('../employees/import-csv.ts', import.meta.url),
    new URL('../employees/import-worker.ts', import.meta.url),
    new URL('../../app/(tenant)/t/[tenant]/(pro)/imports/actions.ts', import.meta.url),
    new URL('../../app/(tenant)/t/[tenant]/(pro)/imports/[jobId]/page.tsx', import.meta.url),
  ];
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  const legacyOwnershipColumn = ['client', 'id'].join('_');
  assert.doesNotMatch(source, /kind:\s*['"]clients['"]/);
  assert.doesNotMatch(source, /clientCsvRowSchema|insertClient|Client CSV/);
  assert.doesNotMatch(source, /formData\.get\(['"](?:parent_)?(?:client|company)_id/);
  assert.equal(source.includes(legacyOwnershipColumn), false);
  assert.match(source, /type BulkImportKind = 'employees'/);
  // Rows are applied only by the leased RPC consumer, never by the Server Action.
  assert.doesNotMatch(source, /from\('employees'\)\.insert/u);
  assert.doesNotMatch(source, /from\('bulk_import_jobs'\)\.(?:insert|update)/u);
  assert.match(
    source,
    /\.eq\('tenant_id', actor\.tenantId\)[\s\S]*?\.eq\('company_id', actor\.companyId\)/u,
  );
});
