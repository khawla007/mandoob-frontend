import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./UploadDocumentDialog.tsx', import.meta.url), 'utf8');

test('upload retries retain one operation id until file, dialog, or success resets it', () => {
  assert.match(source, /useRef<string \| null>\(null\)/u);
  assert.match(source, /operationId\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(source, /formData\.set\('operation_id', operationId\.current\)/u);
  assert.match(source, /onChange=\{\(\) => \{[\s\S]*?operationId\.current = null/u);
  assert.match(source, /if \(!next\)[\s\S]*?operationId\.current = null/u);
  assert.match(source, /result\.ok[\s\S]*?operationId\.current = null/u);
});
