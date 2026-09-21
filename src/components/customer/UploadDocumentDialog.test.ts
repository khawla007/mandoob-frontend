import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./UploadDocumentDialog.tsx', import.meta.url), 'utf8');

test('upload retries retain one operation id until file, dialog, or success resets it', () => {
  assert.match(source, /function onSubmit\(event: FormEvent<HTMLFormElement>\)/u);
  assert.match(source, /event\.preventDefault\(\)/u);
  assert.match(source, /const form = event\.currentTarget/u);
  assert.match(source, /new FormData\(form\)/u);
  assert.match(source, /<form onSubmit=\{onSubmit\}/u);
  assert.doesNotMatch(source, /<form action=\{onSubmit\}/u);
  assert.match(source, /if \(!next && pending\) return/u);
  assert.match(source, /useRef<string \| null>\(null\)/u);
  assert.match(source, /operationId\.current \?\?= crypto\.randomUUID\(\)/u);
  assert.match(source, /formData\.set\('operation_id', operationId\.current\)/u);
  assert.match(source, /onChange=\{\(\) => \{[\s\S]*?operationId\.current = null/u);
  assert.match(source, /if \(!next\)[\s\S]*?operationId\.current = null/u);
  assert.match(source, /result\.ok[\s\S]*?operationId\.current = null/u);
});

test('upload uses the bounded same-origin route with CSRF and safe response handling', () => {
  assert.doesNotMatch(source, /uploadDocumentAction/u);
  assert.match(
    source,
    /fetch\([\s\S]*?`\/api\/v1\/t\/\$\{encodeURIComponent\(slug\)\}\/\$\{audience\}\/documents\/upload`/u,
  );
  assert.match(source, /audience = 'customer'/u);
  assert.match(source, /credentials:\s*'same-origin'/u);
  assert.match(source, /x-mandoob-csrf/u);
  assert.match(source, /mandoob-csrf/u);
  assert.match(source, /catch[\s\S]*?UPLOAD_FAILED/u);
  assert.match(source, /response\.json\(\)[\s\S]*?UPLOAD_FAILED/u);
  assert.match(source, /isSuccessfulUploadPayload\(payload\)/u);
  assert.match(source, /Object\.keys\(data\)\.length === 2/u);
});
