import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(customer)/portal/documents/actions.ts'),
  'utf8',
);

test('customer signing uses the exact version relation and linked-company scope regardless of uploader', () => {
  assert.match(
    source,
    /document:documents!document_versions_document_id_fkey!inner\(id, tenant_id, company_id\)/u,
  );
  assert.match(source, /\.eq\('tenant_id', ctx\.tenant\.id\)/u);
  assert.doesNotMatch(source, /\.eq\('uploaded_by', ctx\.caller\.id\)/u);
  assert.match(source, /owned\.tenant_id !== ctx\.tenant\.id/u);
  assert.doesNotMatch(source, /owned\.uploaded_by !== ctx\.caller\.id/u);
  assert.match(source, /doc\.company_id !== ctx\.linkedCompanyId/u);
});
