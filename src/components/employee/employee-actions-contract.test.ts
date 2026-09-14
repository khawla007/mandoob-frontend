import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (file: string) =>
  readFileSync(
    join(process.cwd(), 'src/app/(tenant)/t/[tenant]/(employee)/employee', file),
    'utf8',
  );

test('signed download action reauthorizes own Employee scope and returns codes without raw messages', () => {
  const actions = source('documents/actions.ts');
  assert.match(actions, /authorizeEmployeePortalRead\(/u);
  assert.match(actions, /getEmployeeDocumentSignedUrl\(/u);
  assert.doesNotMatch(actions, /error:\s*e\.message|error:\s*error\.message/u);
  assert.match(actions, /DOCUMENT_UNAVAILABLE|OPEN_FAILED/u);
  const page = source('documents/page.tsx');
  assert.match(page, /getEmployeeDocumentSignedUrlAction\.bind/u);
  assert.doesNotMatch(page, /versionId=\{/u);
  const button = readFileSync(
    join(process.cwd(), 'src/components/employee/OpenEmployeeSignedUrlButton.tsx'),
    'utf8',
  );
  assert.match(button, /window\.location\.assign/u);
  assert.match(button, /role="alert"/u);
});

test('reminder action directly authorizes and returns accessible success or sanitized error state', () => {
  const actions = source('settings/actions.ts');
  assert.match(actions, /authorizeEmployeePortalRead\(/u);
  assert.match(actions, /status:\s*'success'/u);
  assert.match(actions, /status:\s*'error'/u);
  assert.match(actions, /revalidatePath/u);
});
