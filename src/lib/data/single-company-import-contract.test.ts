import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production import code has no client CSV kind or insertion branch', async () => {
  const files = [
    new URL('../validation/bulk-import.ts', import.meta.url),
    new URL('./bulk-import.ts', import.meta.url),
    new URL('../../app/(tenant)/t/[tenant]/(pro)/imports/actions.ts', import.meta.url),
    new URL('../../app/(tenant)/t/[tenant]/(pro)/imports/[jobId]/page.tsx', import.meta.url),
  ];
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const source = sources.join('\n');
  const dataSource = sources[1];
  assert.doesNotMatch(source, /kind:\s*['"]clients['"]/);
  assert.doesNotMatch(
    source,
    /clientCsvRowSchema|insertClient|Client CSV|clientExistsByTradeLicense/,
  );
  assert.doesNotMatch(source, /parentClientId|client_id/);
  assert.match(source, /type BulkImportKind = 'employees'/);
  assert.match(dataSource, /\.eq\('tenant_id', tenantId\)[\s\S]*?\.eq\('company_id', companyId\)/);
  assert.match(source, /resolveImportCompany\(session\.id, tenant\.id, tenantSlug\)/);
});
