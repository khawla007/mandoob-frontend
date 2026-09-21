import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

test('Employee pending own requests render the shared retry-safe bounded upload interaction', () => {
  const page = readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(employee)/employee/documents/page.tsx'),
    'utf8',
  );
  const dialog = readFileSync(
    join(process.cwd(), 'src/components/customer/UploadDocumentDialog.tsx'),
    'utf8',
  );
  assert.match(page, /<UploadDocumentDialog/u);
  assert.match(page, /audience="employee"/u);
  assert.match(page, /requestId=\{request\.id\}/u);
  assert.match(page, /docType=\{parsedDocType\.data\}/u);
  assert.doesNotMatch(page, /uploadUnavailableTitle|uploadUnavailable/u);
  assert.match(dialog, /\$\{audience\}\/documents\/upload/u);
  assert.match(dialog, /operationId\.current \?\?= crypto\.randomUUID/u);
});
