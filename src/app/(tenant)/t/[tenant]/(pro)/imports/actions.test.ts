import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(
  join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(pro)/imports/actions.ts'),
  'utf8',
);

test('every import mutation rechecks active tenant status after PRO authorization', () => {
  for (const action of [
    'uploadBulkImportAction',
    'validateBulkImportAction',
    'executeBulkImportAction',
    'cancelBulkImportAction',
  ]) {
    const start = source.indexOf(`export async function ${action}`);
    const next = source.indexOf('\nexport async function ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    assert.match(body, /requireTenantContext\(tenantSlug\)/u, action);
  }
  assert.match(source, /await requireActiveTenant\(context\.tenant\.id\)/u);
});

test('upload accepts only bounded CSV files and every mutation writes tenant audit context', () => {
  assert.match(source, /const MAX_CSV_BYTES = \d+/u);
  assert.match(source, /file\.size > MAX_CSV_BYTES/u);
  assert.match(source, /file\.type/u);
  assert.match(source, /writeImportAudit/u);
  assert.doesNotMatch(source, /\.xlsx|application\/vnd\.openxmlformats/u);
});
